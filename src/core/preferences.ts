import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import { UserRow, InferredPreference, EvidenceItem } from './types';

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

const DIRECT_PREF_MAP: Record<string, number> = {
  strong: 0.9,
  moderate: 0.55,
  none: 0.15,
};
const PRICE_SENS_MAP: Record<string, number> = {
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

let extractor: FeatureExtractionPipeline | null = null;
let modelLoading = false;
const archetypeEmbeddings: Record<string, number[][]> = {};

export async function initEmbeddingModel() {
  if (extractor || modelLoading) return;
  modelLoading = true;
  try {
    console.log(
      '[Saarathi Embeddings] Initializing all-MiniLM-L6-v2 pipeline...',
    );
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    // Pre-calculate archetype embeddings
    for (const [dimension, phrases] of Object.entries(ARCHETYPES)) {
      archetypeEmbeddings[dimension] = [];
      for (const phrase of phrases) {
        const out = await extractor(phrase, {
          pooling: 'mean',
          normalize: true,
        });
        archetypeEmbeddings[dimension].push(Array.from(out.data) as number[]);
      }
    }
    console.log(
      '[Saarathi Embeddings] Model and archetype embeddings loaded successfully.',
    );
  } catch (err) {
    console.warn(
      '[Saarathi Embeddings] Failed to load embedding model, falling back to rules-only mode:',
      err,
    );
  } finally {
    modelLoading = false;
  }
}

async function findEmbeddingMatch(phrase: string): Promise<{
  dimension: string;
  similarity: number;
  archetype: string;
} | null> {
  if (!extractor) return null;
  try {
    const out = await extractor(phrase, { pooling: 'mean', normalize: true });
    const v = Array.from(out.data) as number[];

    let bestMatch: {
      dimension: string;
      similarity: number;
      archetype: string;
    } | null = null;

    for (const [dimension, embedList] of Object.entries(archetypeEmbeddings)) {
      for (let i = 0; i < embedList.length; i++) {
        const archEmbed = embedList[i];
        let dot = 0;
        for (let j = 0; j < v.length; j++) {
          dot += v[j] * archEmbed[j];
        }
        // Match threshold at 0.78 for semantic closeness
        if (dot > 0.78 && (!bestMatch || dot > bestMatch.similarity)) {
          bestMatch = {
            dimension,
            similarity: dot,
            archetype: ARCHETYPES[dimension as keyof typeof ARCHETYPES][i],
          };
        }
      }
    }
    return bestMatch;
  } catch {
    return null;
  }
}

function countHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
}

export async function inferPreferences(
  user: UserRow,
  requestText?: string,
): Promise<InferredPreference> {
  // Try to initialize embedding model (non-blocking if already loaded)
  if (!extractor && !modelLoading) {
    await initEmbeddingModel();
  }

  const phrases: { text: string; isRequest: boolean }[] = (
    user.raw_history ?? ''
  )
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ text: p, isRequest: false }));

  if (requestText) {
    // Split requestText by typical sentence boundaries, clauses, or logical delimiters
    const requestPhrases = requestText
      .split(/[.!?|;]|\band\b|\bbut\b/i)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const rp of requestPhrases) {
      phrases.push({ text: rp, isRequest: true });
    }
  }

  const evidence: EvidenceItem[] = [];

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

  for (const phraseObj of phrases) {
    const phrase = phraseObj.text;
    const isRequest = phraseObj.isRequest;
    const sourceLabel = isRequest ? 'trip_description' : 'raw_history';
    let matched = false;

    if (countHits(phrase, DIRECT_BOOST) > 0) {
      directHits++;
      evidence.push({
        text: `${sourceLabel}: "${phrase}" signals direct-flight preference`,
        source: sourceLabel,
        dimension: 'direct',
      });
      matched = true;
    }
    if (countHits(phrase, COST_BOOST) > 0) {
      costHits++;
      evidence.push({
        text: `${sourceLabel}: "${phrase}" signals price sensitivity`,
        source: sourceLabel,
        dimension: 'cost',
      });
      matched = true;
    }
    if (countHits(phrase, CONVENIENCE_BOOST) > 0) {
      convHits++;
      evidence.push({
        text: `${sourceLabel}: "${phrase}" signals comfort-over-cost`,
        source: sourceLabel,
        dimension: 'convenience',
      });
      matched = true;
    }
    if (countHits(phrase, REDEYE_AVOID) > 0) {
      avoidRedeyeHits++;
      evidence.push({
        text: `${sourceLabel}: "${phrase}" signals redeye avoidance`,
        source: sourceLabel,
        dimension: 'redeye',
      });
      matched = true;
    }
    if (countHits(phrase, REDEYE_OK) > 0) {
      redeyeOkHits++;
      evidence.push({
        text: `${sourceLabel}: "${phrase}" signals redeye acceptance`,
        source: sourceLabel,
        dimension: 'redeye',
      });
      matched = true;
    }

    // Embedding fallback if regex didn't match
    if (!matched && extractor) {
      const embedMatch = await findEmbeddingMatch(phrase);
      if (embedMatch) {
        evidence.push({
          text: `embedding similarity: "${phrase}" matches archetype "${embedMatch.archetype}" (${Math.round(embedMatch.similarity * 100)}% similarity)`,
          source: isRequest ? 'trip_description' : 'embedding',
          dimension: embedMatch.dimension as
            'direct' | 'cost' | 'convenience' | 'redeye',
        });

        if (embedMatch.dimension === 'direct') directHits++;
        else if (embedMatch.dimension === 'cost') costHits++;
        else if (embedMatch.dimension === 'convenience') convHits++;
        else if (embedMatch.dimension === 'redeye') avoidRedeyeHits++;
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
