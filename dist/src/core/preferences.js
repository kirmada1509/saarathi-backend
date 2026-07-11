"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initEmbeddingModel = initEmbeddingModel;
exports.inferPreferences = inferPreferences;
const transformers_1 = require("@xenova/transformers");
const DIRECT_BOOST = [
    /hate connections/i,
    /avoid.*connection/i,
    /direct (whenever|only)/i,
    /worth paying for/i,
    /scared of missing connections/i,
    /tight connections/i,
    /stress me/i,
];
const COST_BOOST = [
    /cheapest/i,
    /steal/i,
    /rock-bottom/i,
    /broke/i,
    /whatever'?s cheapest/i,
    /dont care about stops/i,
    /don'?t care about stops/i,
    /absolute cheapest/i,
];
const CONVENIENCE_BOOST = [
    /comfort over cost/i,
    /money'?s not the constraint/i,
    /the works/i,
    /chauffeur/i,
    /spa lounge/i,
    /pay to skip/i,
];
const REDEYE_AVOID = [
    /redeyes? kill/i,
    /melt down at night/i,
    /morning departures/i,
];
const REDEYE_OK = [/ok with redeye/i, /happy .*redeye/i];
const DIRECT_PREF_MAP = {
    strong: 0.9,
    moderate: 0.55,
    none: 0.15,
};
const PRICE_SENS_MAP = {
    low: 0.2,
    medium: 0.5,
    high: 0.85,
    none: 0.05,
};
const ARCHETYPES = {
    direct: [
        'I hate flight connections and layovers',
        'I want to fly direct only',
        'Direct flights are worth paying for',
    ],
    cost: [
        'I need the cheapest flight available',
        'I am on a tight budget',
        'Looking for rock-bottom fares',
    ],
    convenience: [
        'I prefer comfort and convenience over cost',
        'Money is not a constraint for my travel',
        'I want first class or business class service',
    ],
    redeye: [
        'I want to avoid overnight redeye flights',
        'Redeyes kill my sleep and mornings',
        'I hate flying through the night',
    ],
};
let extractor = null;
let modelLoading = false;
const archetypeEmbeddings = {};
async function initEmbeddingModel() {
    if (extractor || modelLoading)
        return;
    modelLoading = true;
    try {
        console.log('[Saarathi Embeddings] Initializing all-MiniLM-L6-v2 pipeline...');
        extractor = await (0, transformers_1.pipeline)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        for (const [dimension, phrases] of Object.entries(ARCHETYPES)) {
            archetypeEmbeddings[dimension] = [];
            for (const phrase of phrases) {
                const out = await extractor(phrase, {
                    pooling: 'mean',
                    normalize: true,
                });
                archetypeEmbeddings[dimension].push(Array.from(out.data));
            }
        }
        console.log('[Saarathi Embeddings] Model and archetype embeddings loaded successfully.');
    }
    catch (err) {
        console.warn('[Saarathi Embeddings] Failed to load embedding model, falling back to rules-only mode:', err);
    }
    finally {
        modelLoading = false;
    }
}
async function findEmbeddingMatch(phrase) {
    if (!extractor)
        return null;
    try {
        const out = await extractor(phrase, { pooling: 'mean', normalize: true });
        const v = Array.from(out.data);
        let bestMatch = null;
        for (const [dimension, embedList] of Object.entries(archetypeEmbeddings)) {
            for (let i = 0; i < embedList.length; i++) {
                const archEmbed = embedList[i];
                let dot = 0;
                for (let j = 0; j < v.length; j++) {
                    dot += v[j] * archEmbed[j];
                }
                if (dot > 0.78 && (!bestMatch || dot > bestMatch.similarity)) {
                    bestMatch = {
                        dimension,
                        similarity: dot,
                        archetype: ARCHETYPES[dimension][i],
                    };
                }
            }
        }
        return bestMatch;
    }
    catch {
        return null;
    }
}
function countHits(text, patterns) {
    return patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
}
async function inferPreferences(user) {
    if (!extractor && !modelLoading) {
        await initEmbeddingModel();
    }
    const rawHistory = user.raw_history ?? '';
    const phrases = rawHistory
        .split(' | ')
        .map((p) => p.trim())
        .filter(Boolean);
    const evidence = [];
    let directWeight = DIRECT_PREF_MAP[user.direct_preference] ?? 0.3;
    let costWeight = PRICE_SENS_MAP[user.price_sensitivity] ?? 0.5;
    evidence.push({
        text: `structured: direct_preference=${user.direct_preference} -> direct_weight=${directWeight}`,
        source: 'structured',
        dimension: 'direct',
    });
    evidence.push({
        text: `structured: price_sensitivity=${user.price_sensitivity} -> cost_weight=${costWeight}`,
        source: 'structured',
        dimension: 'cost',
    });
    let directHits = 0;
    let costHits = 0;
    let convHits = 0;
    let avoidRedeyeHits = 0;
    let redeyeOkHits = 0;
    for (const phrase of phrases) {
        let matched = false;
        if (countHits(phrase, DIRECT_BOOST) > 0) {
            directHits++;
            evidence.push({
                text: `raw_history: "${phrase}" signals direct-flight preference`,
                source: 'raw_history',
                dimension: 'direct',
            });
            matched = true;
        }
        if (countHits(phrase, COST_BOOST) > 0) {
            costHits++;
            evidence.push({
                text: `raw_history: "${phrase}" signals price sensitivity`,
                source: 'raw_history',
                dimension: 'cost',
            });
            matched = true;
        }
        if (countHits(phrase, CONVENIENCE_BOOST) > 0) {
            convHits++;
            evidence.push({
                text: `raw_history: "${phrase}" signals comfort-over-cost`,
                source: 'raw_history',
                dimension: 'convenience',
            });
            matched = true;
        }
        if (countHits(phrase, REDEYE_AVOID) > 0) {
            avoidRedeyeHits++;
            evidence.push({
                text: `raw_history: "${phrase}" signals redeye avoidance`,
                source: 'raw_history',
                dimension: 'redeye',
            });
            matched = true;
        }
        if (countHits(phrase, REDEYE_OK) > 0) {
            redeyeOkHits++;
            evidence.push({
                text: `raw_history: "${phrase}" signals redeye acceptance`,
                source: 'raw_history',
                dimension: 'redeye',
            });
            matched = true;
        }
        if (!matched && extractor) {
            const embedMatch = await findEmbeddingMatch(phrase);
            if (embedMatch) {
                evidence.push({
                    text: `embedding similarity: "${phrase}" matches archetype "${embedMatch.archetype}" (${Math.round(embedMatch.similarity * 100)}% similarity)`,
                    source: 'embedding',
                    dimension: embedMatch.dimension,
                });
                if (embedMatch.dimension === 'direct')
                    directHits++;
                else if (embedMatch.dimension === 'cost')
                    costHits++;
                else if (embedMatch.dimension === 'convenience')
                    convHits++;
                else if (embedMatch.dimension === 'redeye')
                    avoidRedeyeHits++;
            }
        }
    }
    if (directHits > 0) {
        directWeight = Math.min(1, directWeight + 0.1 * directHits);
    }
    if (costHits > 0) {
        costWeight = Math.min(1, costWeight + 0.1 * costHits);
    }
    let convenienceWeight = Math.max(0, 1 - costWeight * 0.6);
    if (convHits > 0) {
        convenienceWeight = Math.min(1, convenienceWeight + 0.15 * convHits);
    }
    const avoidRedeye = avoidRedeyeHits > 0 && redeyeOkHits === 0;
    const preferredAirlines = (user.preferred_airlines ?? '')
        .split(';')
        .map((a) => a.trim())
        .filter(Boolean);
    if (preferredAirlines.length > 0) {
        evidence.push({
            text: `structured: preferred airlines are ${preferredAirlines.join(', ')}`,
            source: 'structured',
            dimension: 'airline',
        });
    }
    if (user.preferred_cabin) {
        evidence.push({
            text: `structured: preferred cabin is ${user.preferred_cabin}`,
            source: 'structured',
            dimension: 'cabin',
        });
    }
    return {
        user_id: user.user_id,
        direct_weight: Math.round(directWeight * 100) / 100,
        cost_weight: Math.round(costWeight * 100) / 100,
        convenience_weight: Math.round(convenienceWeight * 100) / 100,
        max_layover_minutes: Number(user.max_layover_minutes) || 240,
        date_flexibility_days: Number(user.date_flexibility_days) || 0,
        avoid_redeye: avoidRedeye,
        home_airport: user.home_airport,
        preferred_airlines: preferredAirlines,
        preferred_cabin: user.preferred_cabin,
        evidence,
    };
}
//# sourceMappingURL=preferences.js.map