import { Injectable, NotFoundException } from '@nestjs/common';
import { MultiCityService } from '../../saarathi/multicity.service';
import { ConfidenceService } from '../../saarathi/confidence.service';
import { CortexService } from '../../cortex/cortex.service';
import {
  TraceStage,
  ScoredFlight,
  InferredPreference,
  RecommendResponse,
  Perturbation,
} from '../../saarathi/types';

export interface RecommendMultiCityParams {
  userId: string;
  requestText: string;
  cities: string[];
  perturbedPref: InferredPreference;
  perturbations: Perturbation[];
  destination?: string;
  stayDurations?: Record<string, number>;
  warnings?: string[];
}

@Injectable()
export class RecommendMultiCityService {
  constructor(
    private readonly cortexService: CortexService,
    private readonly multiCityService: MultiCityService,
    private readonly confidenceService: ConfidenceService,
  ) {}
  async getRecommendation(
    params: RecommendMultiCityParams,
  ): Promise<RecommendResponse> {
    const {
      userId,
      requestText,
      cities,
      perturbedPref,
      perturbations,
      destination,
      stayDurations,
      warnings,
    } = params;
    const mcResult = this.multiCityService.optimizeRoute(
      cities,
      perturbedPref,
      destination,
      stayDurations,
    );

    if (!mcResult) {
      throw new NotFoundException({
        error:
          'No valid multi-city routes found. Please check date constraints and connection limits.',
      });
    }

    const { itinerary, alternatives, counterfactualLabel, scoreGap } = mcResult;

    // Multi-city mock ScoredFlight verdict (first leg flight anchor)
    const verdict = itinerary.legs[0].flight;

    // Build synthetic ranked array with proper score margin so computeConfidence
    // can compute an accurate tier. The champion score is the first-leg flight score,
    // the challenger score = champion - scoreGap (so margin = scoreGap).
    const championScore = verdict.score;
    const challengerScore = Math.max(0, championScore - scoreGap);
    const syntheticRanked: ScoredFlight[] = [
      { ...verdict, score: championScore },
      { ...verdict, score: challengerScore },
    ];

    const ranked = itinerary.legs.map((l) => l.flight);

    // Create ordering counterfactual list
    const counterfactuals = [
      {
        perturbation: { kind: 'accept_one_stop' as const },
        label: counterfactualLabel,
        newWinner: verdict,
        flips:
          counterfactualLabel !==
          'Nothing else within reason changes this routing decision.',
      },
    ];

    const confidence = this.confidenceService.computeConfidence(
      syntheticRanked,
      perturbedPref,
    );

    // LLM explanation via CortexService
    const explanation = await this.cortexService.generateExplanation(
      userId,
      requestText,
      perturbedPref,
      [verdict],
      alternatives,
      counterfactuals,
      confidence,
      warnings,
    );

    const trace: TraceStage[] = [
      {
        id: 'request',
        label: 'Query Parse',
        payload: { userId, requestText, cities, perturbations },
      },
      {
        id: 'preferences',
        label: 'Preferences Evidence',
        payload: perturbedPref.evidence,
      },
      {
        id: 'constraints',
        label: 'Itinerary Turnaround',
        payload: itinerary.legs.map((l) => ({
          from: l.from,
          to: l.to,
          flight_id: l.flight.flight_id,
          minStayDays: l.minStayDays,
        })),
      },
      {
        id: 'candidates',
        label: 'Optimal Routing Order',
        payload: itinerary.cities,
      },
      {
        id: 'tradeoffs',
        label: 'Itinerary Opportunity Cost',
        payload: alternatives,
      },
      {
        id: 'counterfactuals',
        label: 'Route Order Counterfactuals',
        payload: counterfactuals,
      },
      { id: 'verdict', label: 'Verdict Summary', payload: itinerary },
    ];

    return {
      mode: 'multi-city',
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
  }
}
