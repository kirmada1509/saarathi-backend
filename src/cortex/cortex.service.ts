/**
 * llm.service.ts
 *
 * The single source of truth for all LLM interactions in Saarathi.
 * Owns two capabilities:
 *   1. generateExplanation – turns ranked flights + evidence into a plain-English
 *      AI rationale via Groq (with a deterministic fallback).
 *   2. parseRoute – extracts origin / destination / multi-city legs + stay
 *      durations from a free-text travel request via Groq (with a null fallback).
 *
 * Both capabilities share the same model factory and API-key guard so there
 * is exactly one place to change model names, temperature, or provider.
 */
import { Injectable } from '@nestjs/common';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatGroq } from '@langchain/groq';
import {
  InferredPreference,
  ScoredFlight,
  Alternative,
  Counterfactual,
  Confidence,
} from '../saarathi/types';

// ─── Shared types ───────────────────────────────────────────────────────────

export interface ParsedRoute {
  origin: string | null;
  destination: string | null;
  cities: string[] | null;
  stayDurations: Record<string, number> | null;
}

/** Raw shape returned by the LLM JSON blob (all fields optional / unknown) */
interface LLMRouteRaw {
  origin?: string | null;
  destination?: string | null;
  cities?: unknown[] | null;
  stayDurations?: Record<string, unknown> | null;
}

// ─── Prompt templates ────────────────────────────────────────────────────────

const EXPLAIN_PROMPT =
  ChatPromptTemplate.fromTemplate(`You are Saarathi, an expert travel strategist AI. A traveler ({userId}) asked: "{requestText}"

Here is the structured and behavioral evidence we inferred for their travel preferences:
{evidence}

We evaluated all candidate flights and ranked them. Here are the top 3 options:
{options}

Here is the opportunity cost/alternatives analysis (what they are giving up):
{alternatives}

Here is the decision boundary analysis (what would change our recommendation):
{counterfactuals}

Our recommendation has a match score of {matchPct}% with a confidence tier of "{confidenceTier}".

In 3-4 sentences, explain why the #1 ranked flight is the absolute best match for this traveler. You must justify this recommendation by directly citing the preferences evidence, the trade-offs they are making, and the decision boundary. Do not invent any facts or reasoning that isn't grounded in the provided data. Be extremely direct and concise.`);

const ROUTE_PROMPT = ChatPromptTemplate.fromTemplate(`
Extract the flight origin, destination, and intermediate cities/stay durations from this travel request.
The traveler's home airport is {homeAirport}.
Known airport codes: {knownCodes}.

Request: "{requestText}"

Rules:
- "home" or "go home" or "return home" means the traveler's home airport ({homeAirport}).
- "from X" means X is the ORIGIN. "to X" or just naming a city as a target means DESTINATION.
- "via X" or visiting a list of cities in a sequence means intermediate cities in a multi-city route.
- If it is a multi-city route (visiting 2 or more intermediate cities, e.g. "visit London, Paris, and Rome"), set "cities" to the list of IATA codes in travel order, and set "origin" and "destination" to null.
- If it is a single-leg flight (A to B), set "cities" to null, and identify "origin" and "destination". If origin is not mentioned, default "origin" to {homeAirport}.
- Only use airport codes from the known list. If you cannot confidently determine a code, use null.
- Also extract any per-city stay durations in nights if mentioned (e.g. "3 nights in Rome", "stay in CDG for 2 days"). Return the durations as a JSON record mapping the airport code to the number of nights.

Respond with ONLY this JSON object, no other text or explanation:
{{"origin": "XXX" | null, "destination": "XXX" | null, "cities": ["XXX", "YYY"] | null, "stayDurations": {{"XXX": 2}} | null}}
`);

// ─── Per-request cache for route parsing ────────────────────────────────────
const routeCache = new Map<string, ParsedRoute>();

@Injectable()
export class CortexService {
  // ── Private helpers ────────────────────────────────────────────────────────

  private buildGroqModel(temperature: number): ChatGroq | null {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    return new ChatGroq({
      apiKey,
      model: 'llama-3.3-70b-versatile',
      temperature,
    });
  }

  private formatOptions(ranked: ScoredFlight[], topN = 3): string {
    return ranked
      .slice(0, topN)
      .map(
        (f, i) =>
          `${i + 1}. ${f.airline_name} ${f.flight_numbers}: $${f.price.toFixed(0)}, ${(
            f.duration_minutes / 60
          ).toFixed(1)}h, ${f.stops} stop(s), score=${f.score.toFixed(2)}`,
      )
      .join('\n');
  }

  private formatAlternatives(alternatives: Alternative[]): string {
    return alternatives
      .map((alt) => `- ${alt.kind}: ${alt.gain} (cost: ${alt.cost || 'none'})`)
      .join('\n');
  }

  private formatCounterfactuals(cfs: Counterfactual[]): string {
    return cfs
      .map((cf) => `- ${cf.label} (${cf.flips ? 'FLIPS winner' : 'no flip'})`)
      .join('\n');
  }

  private explanationFallback(
    userId: string,
    pref: InferredPreference,
    ranked: ScoredFlight[],
    confidence: Confidence,
  ): string {
    const best = ranked[0];
    const lastEvidence =
      pref.evidence
        .map((e) => e.text)
        .slice(-2)
        .join(', ') || 'structured profile data';
    return (
      `For ${userId}, the top pick is ${best.airline_name} (${best.stops} stop(s), ` +
      `$${best.price.toFixed(0)}, ${(best.duration_minutes / 60).toFixed(1)}h) matching with ${confidence.matchPct}% score ` +
      `(${confidence.tier} confidence), based on: ${lastEvidence}.`
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Generates a plain-English explanation for why the top-ranked flight was
   * chosen. Falls back to a deterministic template when Groq is unavailable.
   */
  async generateExplanation(
    userId: string,
    requestText: string,
    pref: InferredPreference,
    ranked: ScoredFlight[],
    alternatives: Alternative[],
    counterfactuals: Counterfactual[],
    confidence: Confidence,
  ): Promise<string> {
    if (ranked.length === 0) {
      return "No flights matched this traveler's hard constraints for this route — try a different destination or relax the layover limit.";
    }

    const model = this.buildGroqModel(0.4);
    if (!model) {
      return this.explanationFallback(userId, pref, ranked, confidence);
    }

    try {
      const chain = EXPLAIN_PROMPT.pipe(model).pipe(new StringOutputParser());
      const evidenceList = pref.evidence
        .map((e) => `- [${e.source} / ${e.dimension}] ${e.text}`)
        .join('\n');

      return await chain.invoke({
        userId,
        requestText,
        evidence: evidenceList,
        options: this.formatOptions(ranked),
        alternatives: this.formatAlternatives(alternatives),
        counterfactuals: this.formatCounterfactuals(counterfactuals),
        matchPct: confidence.matchPct,
        confidenceTier: confidence.tier,
      });
    } catch (err) {
      console.error(
        '[CortexService] Explanation call failed, using fallback:',
        err,
      );
      return this.explanationFallback(userId, pref, ranked, confidence);
    }
  }

  /**
   * Parses a free-text travel request into a structured route using Groq.
   * Validates all returned IATA codes against the provided airport set.
   * Returns null if Groq is unavailable or the response cannot be parsed.
   */
  async parseRoute(
    requestText: string,
    homeAirport: string,
    knownAirports: Map<string, unknown>,
  ): Promise<ParsedRoute | null> {
    const cacheKey = `${homeAirport}:${requestText.trim()}`;
    if (routeCache.has(cacheKey)) {
      return routeCache.get(cacheKey)!;
    }

    const model = this.buildGroqModel(0);
    if (!model) return null;

    try {
      const knownCodes = [...knownAirports.keys()].join(', ');
      const chain = ROUTE_PROMPT.pipe(model).pipe(new StringOutputParser());
      const responseText = await chain.invoke({
        requestText,
        homeAirport,
        knownCodes,
      });

      let jsonText = responseText.trim();
      if (jsonText.includes('{')) {
        jsonText = jsonText.substring(
          jsonText.indexOf('{'),
          jsonText.lastIndexOf('}') + 1,
        );
      }

      // Cast to our typed shape; all accesses below are guarded with typeof
      const raw = JSON.parse(jsonText) as LLMRouteRaw;

      // Validate origin / destination
      const rawOrigin = typeof raw.origin === 'string' ? raw.origin : null;
      const rawDest =
        typeof raw.destination === 'string' ? raw.destination : null;
      const origin =
        rawOrigin && knownAirports.has(rawOrigin) ? rawOrigin : null;
      const destination =
        rawDest && knownAirports.has(rawDest) ? rawDest : null;

      // Validate city list
      let cities: string[] | null = null;
      if (Array.isArray(raw.cities)) {
        const valid = raw.cities
          .filter((c): c is string => typeof c === 'string')
          .filter((code) => knownAirports.has(code));
        cities = valid.length >= 2 ? valid : null;
      }

      // Validate stay durations
      let stayDurations: Record<string, number> | null = null;
      if (raw.stayDurations && typeof raw.stayDurations === 'object') {
        const validated: Record<string, number> = {};
        for (const [code, val] of Object.entries(raw.stayDurations)) {
          if (knownAirports.has(code)) {
            validated[code] =
              typeof val === 'number' ? val : parseInt(String(val), 10) || 2;
          }
        }
        stayDurations = Object.keys(validated).length > 0 ? validated : null;
      }

      const result: ParsedRoute = {
        origin,
        destination,
        cities,
        stayDurations,
      };
      routeCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.error('[CortexService] Route parse failed:', err);
      return null;
    }
  }
}
