import { Injectable, NotFoundException } from '@nestjs/common';
import { getStore, DataStore } from '../../core/data';
import { filterAndRank, selectAlternatives } from '../../core/ranking';
import { computeCounterfactuals } from '../../core/counterfactuals';
import { computeConfidence } from '../../core/confidence';
import { CortexService } from '../../cortex/cortex.service';
import {
  TraceStage,
  ScoredFlight,
  InferredPreference,
  RecommendResponse,
  FilterTrace,
  FlightRow,
  Alternative,
  Counterfactual,
  Confidence,
  Perturbation,
  UserRow,
} from '../../core/types';

@Injectable()
export class RecommendSingleLegService {
  constructor(private readonly cortexService: CortexService) {}
  async getRecommendation(
    userId: string,
    requestText: string,
    user: UserRow,
    basePref: InferredPreference,
    perturbedPref: InferredPreference,
    perturbations: Perturbation[],
    explicitOrigin?: string,
    explicitDestination?: string,
  ): Promise<RecommendResponse> {
    const store = getStore();

    // 1. Resolve destination (smart text search or user defaults)
    const destination = this.resolveDestination(
      requestText,
      user.home_airport,
      store,
      explicitDestination,
    );

    // 2. Fetch routes and configure parameters
    const origin = explicitOrigin ?? user.home_airport;
    const routeFlights =
      store.flightsByRoute.get(`${origin}-${destination}`) ?? [];
    const preferredDays = this.extractPreferredDays(requestText);
    const opts = { origin, destination, perturbations, preferredDays };

    // 3. Filter and Rank (with dynamic constraint relaxation fallback if flights match is empty)
    const { ranked, filterTrace, relaxedNote } =
      this.runSingleLegRoutingWithFallback(routeFlights, perturbedPref, opts);

    let verdict: ScoredFlight | null = null;
    let alternatives: Alternative[] = [];
    let counterfactuals: Counterfactual[] = [];
    let confidence: Confidence;
    let explanation = '';

    if (ranked.length === 0) {
      // no flights matched even after relaxation
      const bindingStep = this.findBindingConstraint(filterTrace.steps);
      const staticFallback =
        `No flights matched your hard constraints (layovers, dates, redeyes). ` +
        (bindingStep
          ? `The binding constraint was "${bindingStep.constraint}" which eliminated ${bindingStep.removed} flight(s). `
          : '') +
        `Review the decision boundaries below to see what changes would produce recommendations.`;

      alternatives = selectAlternatives([], user);
      counterfactuals = computeCounterfactuals(
        [],
        perturbedPref,
        routeFlights,
        opts,
      );
      confidence = computeConfidence([], perturbedPref);
      explanation = staticFallback;
    } else {
      verdict = ranked[0];
      alternatives = selectAlternatives(ranked, user);
      // Compute counterfactuals against the original unperturbed base preferences
      counterfactuals = computeCounterfactuals(
        ranked,
        basePref,
        routeFlights,
        opts,
      );
      confidence = computeConfidence(ranked, perturbedPref);

      // LLM explanation via LlmService
      explanation = await this.cortexService.generateExplanation(
        userId,
        requestText,
        perturbedPref,
        ranked,
        alternatives,
        counterfactuals,
        confidence,
      );
    }

    if (relaxedNote && ranked.length > 0) {
      explanation = `[${relaxedNote.trim()}] ${explanation}`;
    }

    // 4. Generate structured execution trace stages
    const trace = this.buildSingleLegTrace(
      userId,
      requestText,
      destination,
      perturbations,
      perturbedPref,
      filterTrace,
      ranked,
      relaxedNote,
      alternatives,
      counterfactuals,
      verdict,
    );

    return {
      mode: 'single-leg',
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

  /**
   * Resolves the target airport code, parsing from requestText if missing or fallback to user defaults.
   */
  private resolveDestination(
    requestText: string,
    homeAirport: string,
    store: DataStore,
    explicitDestination?: string,
  ): string {
    let destination = explicitDestination;

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
      const flightsFromHome = store.flightsByOrigin.get(homeAirport) ?? [];
      if (flightsFromHome.length > 0) {
        destination = flightsFromHome[0].destination;
      }
    }

    if (!destination) {
      throw new NotFoundException({
        error:
          'Could not resolve destination. Please select a destination airport.',
      });
    }

    return destination;
  }

  /**
   * Runs the flight filtering and ranking engine.
   * If no flights pass, it attempts dynamic constraint relaxation on layover/redeye bounds.
   */
  private runSingleLegRoutingWithFallback(
    routeFlights: FlightRow[],
    perturbedPref: InferredPreference,
    opts: {
      origin: string;
      destination: string;
      perturbations: Perturbation[];
      preferredDays: string[];
    },
  ): {
    ranked: ScoredFlight[];
    filterTrace: FilterTrace;
    relaxedNote: string;
  } {
    const { ranked, trace: filterTrace } = filterAndRank(
      routeFlights,
      perturbedPref,
      opts,
    );

    if (ranked.length > 0) {
      return { ranked, filterTrace, relaxedNote: '' };
    }

    // Identify the binding constraint (the step that removed the most flights)
    const bindingStep = this.findBindingConstraint(filterTrace.steps);
    let relaxedVerdict: ScoredFlight | null = null;
    let relaxedNote = '';

    if (bindingStep) {
      const { origin, destination, perturbations, preferredDays } = opts;

      // Try relaxing max_layover_minutes by 1.5x if the binding constraint mentions layover
      if (bindingStep.constraint.toLowerCase().includes('layover')) {
        const originalLayover = perturbedPref.max_layover_minutes;
        const relaxedLayover = Math.round(originalLayover * 1.5);
        const relaxedPref: InferredPreference = {
          ...perturbedPref,
          max_layover_minutes: relaxedLayover,
        };
        const relaxedOpts = {
          origin,
          destination,
          perturbations,
          preferredDays,
        };
        const { ranked: relaxedRanked } = filterAndRank(
          routeFlights,
          relaxedPref,
          relaxedOpts,
        );

        if (relaxedRanked.length > 0) {
          relaxedVerdict = relaxedRanked[0];
          relaxedNote = ` [Relaxed: layover <= ${relaxedLayover}m]`;
        } else {
          // Still zero — try also disabling redeye avoidance
          if (perturbedPref.avoid_redeye) {
            const relaxedPref2: InferredPreference = {
              ...relaxedPref,
              avoid_redeye: false,
            };
            const { ranked: relaxedRanked2 } = filterAndRank(
              routeFlights,
              relaxedPref2,
              relaxedOpts,
            );
            if (relaxedRanked2.length > 0) {
              relaxedVerdict = relaxedRanked2[0];
              relaxedNote = ` [Relaxed: layover <= ${relaxedLayover}m + redeye ok]`;
            }
          }
        }
      } else if (
        bindingStep.constraint.toLowerCase().includes('redeye') &&
        perturbedPref.avoid_redeye
      ) {
        // Binding constraint is redeye — try disabling it
        const relaxedPref: InferredPreference = {
          ...perturbedPref,
          avoid_redeye: false,
        };
        const relaxedOpts = {
          origin,
          destination,
          perturbations,
          preferredDays,
        };
        const { ranked: relaxedRanked } = filterAndRank(
          routeFlights,
          relaxedPref,
          relaxedOpts,
        );
        if (relaxedRanked.length > 0) {
          relaxedVerdict = relaxedRanked[0];
          relaxedNote = ' [Relaxed: redeye ok]';
        }
      }
    }

    return {
      ranked: relaxedVerdict ? [relaxedVerdict] : [],
      filterTrace,
      relaxedNote,
    };
  }

  /**
   * Combines all processing stages into the final structured TraceStage trace array for frontend debugging.
   */
  private buildSingleLegTrace(
    userId: string,
    requestText: string,
    destination: string,
    perturbations: Perturbation[],
    perturbedPref: InferredPreference,
    filterTrace: FilterTrace,
    ranked: ScoredFlight[],
    relaxedNote: string,
    alternatives: Alternative[],
    counterfactuals: Counterfactual[],
    verdict: ScoredFlight | null,
  ): TraceStage[] {
    const isRelaxed = relaxedNote !== '';
    return [
      {
        id: 'request',
        label: 'Query Parse',
        payload: { userId, requestText, destination, perturbations },
      },
      {
        id: 'preferences',
        label: 'Preferences Evidence',
        payload: perturbedPref.evidence,
      },
      {
        id: 'constraints',
        label: 'Hard Constraints Applied',
        payload: filterTrace.steps,
      },
      {
        id: 'candidates',
        label: 'Scored Candidates',
        payload: ranked.map((r) =>
          isRelaxed
            ? { id: r.flight_id, score: r.score, note: relaxedNote }
            : { id: r.flight_id, score: r.score, breakdown: r.breakdown },
        ),
      },
      { id: 'tradeoffs', label: 'Opportunity Cost', payload: alternatives },
      {
        id: 'counterfactuals',
        label: isRelaxed ? 'Decision Boundary Advice' : 'Decision Boundaries',
        payload: counterfactuals,
      },
      { id: 'verdict', label: 'Verdict Summary', payload: verdict },
    ];
  }

  private extractPreferredDays(requestText: string): string[] {
    const matches = requestText.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    );
    if (!matches) return [];
    return [...new Set(matches.map((d) => d.toLowerCase()))];
  }

  private findBindingConstraint(
    steps: { constraint: string; removed: number; remaining: number }[],
  ): { constraint: string; removed: number; remaining: number } | null {
    if (steps.length === 0) return null;
    return steps.reduce(
      (max, step) => (step.removed > max.removed ? step : max),
      steps[0],
    );
  }
}
