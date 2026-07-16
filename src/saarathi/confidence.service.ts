import { Injectable } from '@nestjs/common';
import { ScoredFlight, InferredPreference, Confidence } from './types';

const DIMENSION_LABELS: Record<string, string> = {
  direct: 'Direct flight preference',
  cost: 'Price sensitivity',
  convenience: 'Comfort priority',
  redeye: 'Redeye avoidance',
  airline: 'Airline loyalty',
  cabin: 'Cabin class preference',
};

@Injectable()
export class ConfidenceService {
  computeConfidence(
    ranked: ScoredFlight[],
    pref: InferredPreference,
  ): Confidence {
    if (ranked.length === 0) {
      return {
        matchPct: 0,
        tier: 'low',
        strongSignals: [],
        weakSignals: [],
      };
    }

    const champion = ranked[0];

    // 1. Calculate Maximum Achievable Score dynamically from the actual pref weights.
    const costWeight = pref.cost_weight;
    const directWeight = pref.direct_weight;
    const convenienceWeight = pref.convenience_weight;
    const baggageWeight = pref.bags_matter ? 0.25 : 0;

    const maxRawScore =
      costWeight +
      directWeight +
      (1 - costWeight) * 0.5 +
      convenienceWeight * 0.3 +
      0.2 +
      baggageWeight;

    // Apply best-case demand multiplier (low demand = 1.05)
    const maxAchievableScore = maxRawScore * 1.05;

    // Protect against degenerate cases (all weights zero, or champion.score undefined)
    const championScore =
      typeof champion.score === 'number' && isFinite(champion.score)
        ? champion.score
        : 0;
    const matchPct =
      maxAchievableScore > 0
        ? Math.min(
            100,
            Math.max(0, Math.round((championScore / maxAchievableScore) * 100)),
          )
        : 0;

    // 2. Identify Strong vs Weak Signals based on evidence source agreement
    const strongSignals: string[] = [];
    const weakSignals: string[] = [];

    const dimensions = [
      'direct',
      'cost',
      'convenience',
      'redeye',
      'airline',
      'cabin',
    ] as const;

    for (const dim of dimensions) {
      const dimEvidence = pref.evidence.filter((e) => e.dimension === dim);
      if (dimEvidence.length === 0) continue;

      const hasStructured = dimEvidence.some((e) => e.source === 'structured');
      const hasBehavioral = dimEvidence.some(
        (e) => e.source === 'raw_history' || e.source === 'embedding',
      );

      const label = DIMENSION_LABELS[dim];
      if (hasStructured && hasBehavioral) {
        strongSignals.push(label);
      } else {
        weakSignals.push(label);
      }
    }

    // 3. Determine Confidence Tier
    // Margin: gap between #1 and #2
    const challenger = ranked[1];
    const margin = challenger ? champion.score - challenger.score : 1.0;

    let tier: Confidence['tier'] = 'medium';
    if (margin > 0.1) {
      tier = 'high';
    } else if (margin < 0.04) {
      tier = 'low';
    }

    // Demote tier if we have conflicting strong signals or zero strong signals
    const hasConflict =
      strongSignals.includes(DIMENSION_LABELS.cost) &&
      strongSignals.includes(DIMENSION_LABELS.convenience);
    const noSignalAgreement = strongSignals.length === 0;

    if (hasConflict || noSignalAgreement) {
      if (tier === 'high') {
        tier = 'medium';
      } else if (tier === 'medium') {
        tier = 'low';
      }
    }

    // Confidence Tier Floor:
    if (matchPct >= 80 && tier === 'low') {
      tier = 'medium';
    }

    return {
      matchPct,
      tier,
      strongSignals,
      weakSignals,
    };
  }
}
