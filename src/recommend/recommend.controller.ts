import { Controller, Post, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { getStore } from '../core/data';
import { inferPreferences } from '../core/preferences';
import { filterAndRank, selectAlternatives } from '../core/ranking';
import { computeCounterfactuals, applyPerturbations } from '../core/counterfactuals';
import { computeConfidence } from '../core/confidence';
import { explain } from '../core/explain';
import { optimizeRoute } from '../core/multicity';
import { TraceStage } from '../core/types';

const PerturbationSchema = z.union([
  z.object({ kind: z.literal("price_drop"), flightId: z.string(), toPrice: z.number() }),
  z.object({ kind: z.literal("accept_one_stop") }),
  z.object({ kind: z.literal("bags_matter") }),
  z.object({ kind: z.literal("evening_ok") }),
  z.object({ kind: z.literal("ignore_loyalty") }),
  z.object({ kind: z.literal("shift_dates"), days: z.number() }),
]);

const RecommendRequestSchema = z.object({
  userId: z.string(),
  requestText: z.string(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  cities: z.array(z.string()).optional(),
  perturbations: z.array(PerturbationSchema).optional(),
});

@Controller('api/recommend')
export class RecommendController {
  @Post()
  async getRecommendation(@Body() body: any) {
    const parsed = RecommendRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const { userId, requestText, perturbations = [] } = parsed.data;
    const store = getStore();

    // 1. Get User Profile
    const user = store.users.get(userId);
    if (!user) {
      throw new NotFoundException({ error: `User with ID ${userId} not found.` });
    }

    // 2. Infer Preferences (rules + embeddings)
    const basePref = await inferPreferences(user);

    // 3. Apply active perturbations to preferences
    const perturbedPref = applyPerturbations(basePref, perturbations);

    // Check Mode: Multi-City vs Single-Leg
    if (parsed.data.cities && parsed.data.cities.length > 0) {
      const cities = parsed.data.cities;
      const mcResult = optimizeRoute(cities, perturbedPref);
      
      if (!mcResult) {
        throw new NotFoundException({
          error: "No valid multi-city routes found. Please check date constraints and connection limits."
        });
      }

      const { itinerary, alternatives, counterfactualLabel } = mcResult;
      
      // Multi-city mock ScoredFlight verdict (first leg flight anchor)
      const verdict = itinerary.legs[0].flight;
      const ranked = itinerary.legs.map((l) => l.flight);

      // Create ordering counterfactual list
      const counterfactuals = [
        {
          perturbation: { kind: "accept_one_stop" as const },
          label: counterfactualLabel,
          newWinner: verdict,
          flips: counterfactualLabel !== "Nothing else within reason changes this routing decision.",
        },
      ];

      const confidence = computeConfidence(ranked, perturbedPref);

      // LLM explanation
      const explanation = await explain(
        userId,
        requestText,
        perturbedPref,
        [verdict],
        alternatives,
        counterfactuals,
        confidence
      );

      const trace: TraceStage[] = [
        { id: "request", label: "Query Parse", payload: { userId, requestText, cities, perturbations } },
        { id: "preferences", label: "Preferences Evidence", payload: perturbedPref.evidence },
        { id: "constraints", label: "Itinerary Turnaround", payload: itinerary.legs.map(l => ({ from: l.from, to: l.to, flight_id: l.flight.flight_id })) },
        { id: "candidates", label: "Optimal Routing Order", payload: itinerary.cities },
        { id: "tradeoffs", label: "Itinerary Opportunity Cost", payload: alternatives },
        { id: "counterfactuals", label: "Route Order Counterfactuals", payload: counterfactuals },
        { id: "verdict", label: "Verdict Summary", payload: itinerary },
      ];

      return {
        mode: "multi-city",
        verdict,
        ranked,
        preference: perturbedPref,
        alternatives,
        counterfactuals,
        confidence,
        trace,
        explanation,
        itinerary,
        appliedPerturbations: perturbations,
      };

    } else {
      // Single-Leg Mode
      let destination = parsed.data.destination;

      // Smart destination inference if missing
      if (!destination && requestText) {
        const uppercaseMatch = requestText.match(/\b([A-Z]{3})\b/);
        if (uppercaseMatch) {
          destination = uppercaseMatch[1];
        } else {
          for (const [code, info] of store.airports.entries()) {
            if (
              requestText.toLowerCase().includes(info.city.toLowerCase()) ||
              requestText.toLowerCase().includes(code.toLowerCase())
            ) {
              destination = code;
              break;
            }
          }
        }
      }

      if (!destination) {
        throw new BadRequestException({
          error: "Could not resolve destination. Please select a destination airport."
        });
      }

      const origin = parsed.data.origin ?? user.home_airport;
      const routeFlights = store.flightsByRoute.get(`${origin}-${destination}`) ?? [];
      const opts = { origin, destination, perturbations };

      // Filter and Rank
      const { ranked, trace: filterTrace } = filterAndRank(routeFlights, perturbedPref, opts);

      if (ranked.length === 0) {
        // Return 0 inventory state gracefully with counterfactual advice
        const alternatives = selectAlternatives([], user);
        const counterfactuals = computeCounterfactuals([], perturbedPref, routeFlights, opts);
        const confidence = computeConfidence([], perturbedPref);
        const explanation = "No flights matched your hard constraints (layovers, dates, redeyes). Review the decision boundaries below to see what changes would produce recommendations.";

        const trace: TraceStage[] = [
          { id: "request", label: "Query Parse", payload: { userId, requestText, destination, perturbations } },
          { id: "preferences", label: "Preferences Evidence", payload: perturbedPref.evidence },
          { id: "constraints", label: "Hard Constraints Applied", payload: filterTrace.steps },
          { id: "candidates", label: "Scored Candidates", payload: [] },
          { id: "tradeoffs", label: "Opportunity Cost", payload: alternatives },
          { id: "counterfactuals", label: "Decision Boundary Advice", payload: counterfactuals },
          { id: "verdict", label: "Verdict Summary", payload: null },
        ];

        return {
          mode: "single-leg",
          verdict: null,
          ranked: [],
          preference: perturbedPref,
          alternatives,
          counterfactuals,
          confidence,
          trace,
          explanation,
          appliedPerturbations: perturbations,
        };
      }

      const verdict = ranked[0];
      const alternatives = selectAlternatives(ranked, user);

      // Compute counterfactuals against the original unperturbed base preferences
      const counterfactuals = computeCounterfactuals(ranked, basePref, routeFlights, opts);
      const confidence = computeConfidence(ranked, perturbedPref);

      // LLM explanation
      const explanation = await explain(
        userId,
        requestText,
        perturbedPref,
        ranked,
        alternatives,
        counterfactuals,
        confidence
      );

      const trace: TraceStage[] = [
        { id: "request", label: "Query Parse", payload: { userId, requestText, destination, perturbations } },
        { id: "preferences", label: "Preferences Evidence", payload: perturbedPref.evidence },
        { id: "constraints", label: "Hard Constraints Applied", payload: filterTrace.steps },
        { id: "candidates", label: "Scored Candidates", payload: ranked.map(r => ({ id: r.flight_id, score: r.score, breakdown: r.breakdown })) },
        { id: "tradeoffs", label: "Opportunity Cost", payload: alternatives },
        { id: "counterfactuals", label: "Decision Boundaries", payload: counterfactuals },
        { id: "verdict", label: "Verdict Summary", payload: verdict },
      ];

      return {
        mode: "single-leg",
        verdict,
        ranked,
        preference: perturbedPref,
        alternatives,
        counterfactuals,
        confidence,
        trace,
        explanation,
        appliedPerturbations: perturbations,
      };
    }
  }
}
