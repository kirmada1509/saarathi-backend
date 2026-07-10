import { ScoredFlight, InferredPreference, Confidence } from "./types";

const DIMENSION_LABELS: Record<string, string> = {
  direct: "Direct flight preference",
  cost: "Price sensitivity",
  convenience: "Comfort priority",
  redeye: "Redeye avoidance",
  airline: "Airline loyalty",
  cabin: "Cabin class preference",
};

export function computeConfidence(
  ranked: ScoredFlight[],
  pref: InferredPreference
): Confidence {
  if (ranked.length === 0) {
    return {
      matchPct: 0,
      tier: "low",
      strongSignals: [],
      weakSignals: [],
    };
  }

  const champion = ranked[0];

  // 1. Calculate Maximum Achievable Score
  const costWeight = pref.cost_weight;
  const directWeight = pref.direct_weight;
  const convenienceWeight = pref.convenience_weight;
  const baggageWeight = pref.bags_matter ? 0.25 : 0;

  // Maximum achievable values for components:
  // priceScore = 1, directScore = 1, timeScore = 1, cabinScore = 1, airlineScore = 1, baggageScore = 1
  // demandAdj = 1.05 (low demand), holidayAdj = 1 (not holiday)
  const maxRawScore =
    costWeight * 1 +
    directWeight * 1 +
    (1 - costWeight) * 0.5 * 1 +
    convenienceWeight * 0.3 * 1 +
    0.2 * 1 +
    baggageWeight * 1;

  const maxAchievableScore = maxRawScore * 1.05 * 1;

  // matchPct is champion's score / maxAchievableScore
  const matchPct = Math.min(100, Math.max(0, Math.round((champion.score / maxAchievableScore) * 100)));

  // 2. Identify Strong vs Weak Signals based on evidence source agreement
  const strongSignals: string[] = [];
  const weakSignals: string[] = [];

  const dimensions = ["direct", "cost", "convenience", "redeye", "airline", "cabin"] as const;

  for (const dim of dimensions) {
    const dimEvidence = pref.evidence.filter((e) => e.dimension === dim);
    if (dimEvidence.length === 0) continue;

    const hasStructured = dimEvidence.some((e) => e.source === "structured");
    const hasBehavioral = dimEvidence.some((e) => e.source === "raw_history" || e.source === "embedding");

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
  const margin = challenger ? champion.score - challenger.score : 1.0; // If no challenger, margin is max

  let tier: Confidence["tier"] = "medium";
  if (margin > 0.10) {
    tier = "high";
  } else if (margin < 0.04) {
    tier = "low";
  }

  // Demote tier if we have conflicting strong signals or zero strong signals
  const hasConflict = strongSignals.includes(DIMENSION_LABELS.cost) && strongSignals.includes(DIMENSION_LABELS.convenience);
  const noSignalAgreement = strongSignals.length === 0;

  if (hasConflict || noSignalAgreement) {
    if (tier === "high") {
      tier = "medium";
    } else if (tier === "medium") {
      tier = "low";
    }
  }

  return {
    matchPct,
    tier,
    strongSignals,
    weakSignals,
  };
}
