"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeConfidence = computeConfidence;
const DIMENSION_LABELS = {
    direct: 'Direct flight preference',
    cost: 'Price sensitivity',
    convenience: 'Comfort priority',
    redeye: 'Redeye avoidance',
    airline: 'Airline loyalty',
    cabin: 'Cabin class preference',
};
function computeConfidence(ranked, pref) {
    if (ranked.length === 0) {
        return {
            matchPct: 0,
            tier: 'low',
            strongSignals: [],
            weakSignals: [],
        };
    }
    const champion = ranked[0];
    const costWeight = pref.cost_weight;
    const directWeight = pref.direct_weight;
    const convenienceWeight = pref.convenience_weight;
    const baggageWeight = pref.bags_matter ? 0.25 : 0;
    const maxRawScore = costWeight +
        directWeight +
        (1 - costWeight) * 0.5 +
        convenienceWeight * 0.3 +
        0.2 +
        baggageWeight;
    const maxAchievableScore = maxRawScore * 1.05;
    const championScore = typeof champion.score === 'number' && isFinite(champion.score)
        ? champion.score
        : 0;
    const matchPct = maxAchievableScore > 0
        ? Math.min(100, Math.max(0, Math.round((championScore / maxAchievableScore) * 100)))
        : 0;
    const strongSignals = [];
    const weakSignals = [];
    const dimensions = [
        'direct',
        'cost',
        'convenience',
        'redeye',
        'airline',
        'cabin',
    ];
    for (const dim of dimensions) {
        const dimEvidence = pref.evidence.filter((e) => e.dimension === dim);
        if (dimEvidence.length === 0)
            continue;
        const hasStructured = dimEvidence.some((e) => e.source === 'structured');
        const hasBehavioral = dimEvidence.some((e) => e.source === 'raw_history' || e.source === 'embedding');
        const label = DIMENSION_LABELS[dim];
        if (hasStructured && hasBehavioral) {
            strongSignals.push(label);
        }
        else {
            weakSignals.push(label);
        }
    }
    const challenger = ranked[1];
    const margin = challenger ? champion.score - challenger.score : 1.0;
    let tier = 'medium';
    if (margin > 0.1) {
        tier = 'high';
    }
    else if (margin < 0.04) {
        tier = 'low';
    }
    const hasConflict = strongSignals.includes(DIMENSION_LABELS.cost) &&
        strongSignals.includes(DIMENSION_LABELS.convenience);
    const noSignalAgreement = strongSignals.length === 0;
    if (hasConflict || noSignalAgreement) {
        if (tier === 'high') {
            tier = 'medium';
        }
        else if (tier === 'medium') {
            tier = 'low';
        }
    }
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
//# sourceMappingURL=confidence.js.map