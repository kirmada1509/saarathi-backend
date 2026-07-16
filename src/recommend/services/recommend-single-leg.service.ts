import { Injectable } from '@nestjs/common';
import { SaarathiDataService } from '../../saarathi/data.service';
import { RankingService } from '../../saarathi/ranking.service';
import { CounterfactualsService } from '../../saarathi/counterfactuals.service';
import { ConfidenceService } from '../../saarathi/confidence.service';
import { CortexService } from '../../cortex/cortex.service';
import {
  TraceStage,
  ScoredFlight,
  InferredPreference,
  RecommendResponse,
  FilterTrace,
  Alternative,
  Counterfactual,
  Confidence,
  Perturbation,
  UserRow,
} from '../../saarathi/types';

export interface RecommendSingleLegParams {
  userId: string;
  requestText: string;
  user: UserRow;
  basePref: InferredPreference;
  perturbedPref: InferredPreference;
  perturbations: Perturbation[];
  explicitOrigin?: string;
  explicitDestination: string;
  warnings?: string[];
}

@Injectable()
export class RecommendSingleLegService {
  constructor(
    private readonly cortexService: CortexService,
    private readonly dataService: SaarathiDataService,
    private readonly rankingService: RankingService,
    private readonly counterfactualsService: CounterfactualsService,
    private readonly confidenceService: ConfidenceService,
  ) {}
  async getRecommendation(
    params: RecommendSingleLegParams,
  ): Promise<RecommendResponse> {
    const {
      userId,
      requestText,
      user,
      basePref,
      perturbedPref,
      perturbations,
      explicitOrigin,
      explicitDestination: destination,
      warnings,
    } = params;
    const store = this.dataService.getStore();

    // 1. Fetch routes and configure parameters
    const origin = explicitOrigin ?? user.home_airport;
    const routeFlights =
      store.flightsByRoute.get(`${origin}-${destination}`) ?? [];
    const preferredDays = perturbedPref.preferredDays ?? [];
    const opts = { origin, destination, perturbations, preferredDays };

    // 2. Filter and Rank (with dynamic constraint relaxation fallback if flights match is empty)
    const { ranked, filterTrace, relaxedNote } =
      this.rankingService.runSingleLegRoutingWithFallback(
        routeFlights,
        perturbedPref,
        opts,
      );

    let verdict: ScoredFlight | null = null;
    let alternatives: Alternative[] = [];
    let counterfactuals: Counterfactual[] = [];
    let confidence: Confidence;
    let explanation = '';

    if (ranked.length === 0) {
      // no flights matched even after relaxation
      const bindingStep = this.rankingService.findBindingConstraint(
        filterTrace.steps,
      );
      const staticFallback =
        `No flights matched your hard constraints (layovers, dates, redeyes). ` +
        (bindingStep
          ? `The binding constraint was "${bindingStep.constraint}" which eliminated ${bindingStep.removed} flight(s). `
          : '') +
        `Review the decision boundaries below to see what changes would produce recommendations.`;

      alternatives = this.rankingService.selectAlternatives([], user);
      counterfactuals = this.counterfactualsService.computeCounterfactuals(
        [],
        perturbedPref,
        routeFlights,
        opts,
      );
      confidence = this.confidenceService.computeConfidence([], perturbedPref);
      explanation = staticFallback;
    } else {
      verdict = ranked[0];
      alternatives = this.rankingService.selectAlternatives(ranked, user);
      // Compute counterfactuals against the original unperturbed base preferences
      counterfactuals = this.counterfactualsService.computeCounterfactuals(
        ranked,
        basePref,
        routeFlights,
        opts,
      );
      confidence = this.confidenceService.computeConfidence(
        ranked,
        perturbedPref,
      );

      // LLM explanation via LlmService
      explanation = await this.cortexService.generateExplanation(
        userId,
        requestText,
        perturbedPref,
        ranked,
        alternatives,
        counterfactuals,
        confidence,
        warnings,
      );
    }

    if (relaxedNote && ranked.length > 0) {
      explanation = `[${relaxedNote.trim()}] ${explanation}`;
    }

    // 3. Generate structured execution trace stages
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
}
