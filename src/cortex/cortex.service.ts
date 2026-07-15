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
  UserRow,
  EvidenceItem,
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

interface LLMPreferenceEvidenceRaw {
  text?: unknown;
  source?: unknown;
  dimension?: unknown;
}

interface LLMPreferenceRaw {
  direct_weight?: unknown;
  cost_weight?: unknown;
  convenience_weight?: unknown;
  avoid_redeye?: unknown;
  evidence?: unknown[] | null;
}

const evidenceSources = new Set<EvidenceItem['source']>([
  'structured',
  'raw_history',
  'embedding',
  'trip_description',
]);

const evidenceDimensions = new Set<EvidenceItem['dimension']>([
  'direct',
  'cost',
  'convenience',
  'redeye',
  'airline',
  'cabin',
]);

function isEvidenceSource(value: unknown): value is EvidenceItem['source'] {
  return (
    typeof value === 'string' &&
    evidenceSources.has(value as EvidenceItem['source'])
  );
}

function isEvidenceDimension(
  value: unknown,
): value is EvidenceItem['dimension'] {
  return (
    typeof value === 'string' &&
    evidenceDimensions.has(value as EvidenceItem['dimension'])
  );
}

// ─── Prompt templates ────────────────────────────────────────────────────────

const EXPLAIN_PROMPT = ChatPromptTemplate.fromTemplate(`
You are Saarathi, a premium travel strategist AI concierge. 
Explain to traveler {userId} why the #1 ranked flight is the absolute best match for their request: "{requestText}".

Input Data:
1. Traveler Preference Signals (Evidence):
{evidence}

2. Scored & Ranked Flight Choices (Option #1 is our recommendation):
{options}

3. Trade-offs (Alternatives compared to Option #1):
{alternatives}

4. Decision Boundaries (What would change this recommendation):
{counterfactuals}

Recommendation Match Score: {matchPct}%
Confidence Tier: {confidenceTier}

Instructions:
1. You MUST explain why Option #1 (the top-ranked flight) is the best choice. Do not recommend or suggest any other flight as the winner. Do not contradict the ranking.
2. Write in a premium, warm, traveler-centric, and natural tone. Do NOT include raw database variables, technical keys, or developer symbols like "direct_weight", "preferred_cabin", "cost_weight", "->", or parenthetical code variables. Translate them into plain English (e.g. write "price sensitivity is medium" or "strong preference for direct flights").
3. Keep the response to 3-4 concise, highly polished sentences. Focus on the trade-offs they are avoiding and why this match perfectly serves their comfort or budget preferences.
`);

const ROUTE_PROMPT = ChatPromptTemplate.fromTemplate(`
Extract the flight route from this travel request.
The traveler's home airport is {homeAirport}.
Known airport codes: {knownCodes}.

Request: "{requestText}"

Rules:
- "home", "back home", "return home", "go home", "and return", "round trip" all mean the traveler's home airport ({homeAirport}).
- MULTI-CITY (use whenever 2+ stops are involved, including round trips): set "cities" to the full ordered list of IATA stop codes NOT including the departure origin. Set "origin" and "destination" to null.
  Examples:
  · "ICN to NYC and back home" → cities: ["JFK", "ICN"]
  · "visit London, Paris, Rome" → cities: ["LHR", "CDG", "FCO"]
  · "fly to Tokyo, then Seoul, then home" → cities: ["NRT", "ICN"]
- SINGLE LEG (one-way, no return): set "cities" to null, set "origin" (default to {homeAirport} if not stated) and "destination".
- Only use airport codes from the known list. If a city has multiple airports, pick the primary one. If unsure, use null.
- Extract per-city stay durations if mentioned (e.g. "3 nights in Rome" → stayDurations: {{"FCO": 3}}). The final home leg always has 0 nights.

Respond with ONLY this JSON, no explanation:
{{"origin": "XXX" | null, "destination": "XXX" | null, "cities": ["XXX", "YYY"] | null, "stayDurations": {{"XXX": 2}} | null}}
`);

const PREFS_PROMPT = ChatPromptTemplate.fromTemplate(`
Analyze the traveler profile and search prompt to infer travel preference weights.
The traveler has the following profile details:
- home_airport: {homeAirport}
- direct_preference: {directPreference} (structured setting)
- price_sensitivity: {priceSensitivity} (structured setting)
- preferred_cabin: {preferredCabin}
- preferred_airlines: {preferredAirlines}
- raw_history: "{rawHistory}" (unstructured travel notes/history)

Search Prompt: "{requestText}"

Rules for weight values (0.0 to 1.0):
1. direct_weight: 
   - Start from base value: strong=0.9, moderate=0.55, none=0.15.
   - Adjust +0.1 per phrase in search prompt or raw_history signaling a preference for direct flights (e.g. "hate connections", "avoid layovers"). Max 1.0.
2. cost_weight:
   - Start from base value: high=0.85, medium=0.5, low=0.2, none=0.05.
   - Adjust +0.1 per phrase signaling price sensitivity (e.g. "cheapest", "tight budget", "rock-bottom"). Max 1.0.
3. convenience_weight:
   - Start from base value: 1 - (cost_weight * 0.6).
   - Adjust +0.15 per phrase signaling convenience/comfort (e.g. "comfort over cost", "lounge access"). Max 1.0.
4. avoid_redeye:
   - true if there are phrases like "redeye kills me", "avoid overnight" and no opposing phrases. Otherwise false.

Evidence:
You must return a list of evidence items, each matching the structure:
{{"text": "reasoning text citing history/prompt", "source": "raw_history" | "trip_description", "dimension": "direct" | "cost" | "convenience" | "redeye" | "airline" | "cabin"}}
Include evidence for structured profile configurations and any unstructured/trip description phrases you identify.

Respond with ONLY this JSON, no explanation:
{{
  "direct_weight": 0.55,
  "cost_weight": 0.5,
  "convenience_weight": 0.7,
  "avoid_redeye": false,
  "evidence": [
    {{"text": "structured: direct_preference=moderate -> direct_weight=0.55", "source": "structured", "dimension": "direct"}},
    {{"text": "trip_description: 'hate connections' signals direct-flight preference", "source": "trip_description", "dimension": "direct"}}
  ]
}}
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

    // Filter and clean up the evidence texts for a user-friendly message
    const cleanEvidence = pref.evidence
      .map((e) => {
        // Strip out implementation details like -> direct_weight=...
        return e.text
          .replace(/\s*->\s*\w+_\w+=\d+(\.\d+)?/g, '')
          .replace(/structured:\s*/gi, '')
          .replace(/raw_history:\s*/gi, '')
          .replace(/trip_description:\s*/gi, '')
          .replace(/embedding similarity:\s*/gi, '')
          .trim();
      })
      .filter(Boolean);

    const evidenceStr =
      cleanEvidence.length > 0
        ? `This recommendation is aligned with the traveler's preference profile, specifically: ${cleanEvidence.join(', ')}.`
        : `This recommendation is based on their structured profile preferences.`;

    const stopDesc = best.stops === 0 ? 'nonstop' : `${best.stops} stop(s)`;
    const durationHrs = (best.duration_minutes / 60).toFixed(1);

    return (
      `We recommend taking the ${best.airline_name} flight from ${best.origin} to ${best.destination}. ` +
      `It is a ${stopDesc} flight priced at $${best.price.toFixed(0)} with a travel time of ${durationHrs} hours. ` +
      `This option matches the traveler's preferences with a ${confidence.matchPct}% match score (${confidence.tier} confidence). ` +
      `${evidenceStr}`
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
    warnings?: string[],
  ): Promise<string> {
    if (ranked.length === 0) {
      return "No flights matched this traveler's hard constraints for this route — try a different destination or relax the layover limit.";
    }

    const model = this.buildGroqModel(0.4);
    if (!model) {
      warnings?.push(
        'Groq LLM is offline or GROQ_API_KEY is missing. Using local explanation fallback.',
      );
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
      warnings?.push(
        'Groq LLM rate-limited or API call failed. Using local explanation fallback.',
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
    warnings?: string[],
  ): Promise<ParsedRoute | null> {
    const cacheKey = `${homeAirport}:${requestText.trim()}`;
    if (routeCache.has(cacheKey)) {
      return routeCache.get(cacheKey)!;
    }

    const model = this.buildGroqModel(0);
    if (!model) {
      warnings?.push(
        'Groq LLM is offline or GROQ_API_KEY is missing. Using local route parser fallback.',
      );
      return null;
    }

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
      warnings?.push(
        'Groq LLM rate-limited or API call failed. Using local route parser fallback.',
      );
      return null;
    }
  }

  /**
   * Infers preferences using LLM, with fallback validation rules.
   */
  async inferPreferences(
    user: UserRow,
    requestText?: string,
    warnings?: string[],
  ): Promise<InferredPreference | null> {
    const model = this.buildGroqModel(0);
    if (!model) {
      warnings?.push(
        'Groq LLM is offline or GROQ_API_KEY is missing. Using local preferences fallback.',
      );
      return null;
    }

    try {
      const preferredAirlines = (user.preferred_airlines ?? '')
        .split(';')
        .map((a) => a.trim())
        .filter(Boolean);

      const chain = PREFS_PROMPT.pipe(model).pipe(new StringOutputParser());
      const responseText = await chain.invoke({
        homeAirport: user.home_airport,
        directPreference: user.direct_preference,
        priceSensitivity: user.price_sensitivity,
        preferredCabin: user.preferred_cabin,
        preferredAirlines: preferredAirlines.join(', ') || 'None',
        rawHistory: user.raw_history ?? '',
        requestText: requestText ?? '',
      });

      let jsonText = responseText.trim();
      if (jsonText.includes('{')) {
        jsonText = jsonText.substring(
          jsonText.indexOf('{'),
          jsonText.lastIndexOf('}') + 1,
        );
      }

      const parsed: unknown = JSON.parse(jsonText);
      const raw = parsed as LLMPreferenceRaw;

      const direct_weight =
        typeof raw.direct_weight === 'number'
          ? Math.round(raw.direct_weight * 100) / 100
          : 0.3;
      const cost_weight =
        typeof raw.cost_weight === 'number'
          ? Math.round(raw.cost_weight * 100) / 100
          : 0.5;
      const convenience_weight =
        typeof raw.convenience_weight === 'number'
          ? Math.round(raw.convenience_weight * 100) / 100
          : 0.7;
      const avoid_redeye =
        typeof raw.avoid_redeye === 'boolean' ? raw.avoid_redeye : false;

      let evidence: EvidenceItem[] = [];
      if (Array.isArray(raw.evidence)) {
        evidence = raw.evidence.map((entry) => {
          const evidenceEntry = entry as LLMPreferenceEvidenceRaw;
          return {
            text:
              typeof evidenceEntry.text === 'string' ? evidenceEntry.text : '',
            source: isEvidenceSource(evidenceEntry.source)
              ? evidenceEntry.source
              : 'structured',
            dimension: isEvidenceDimension(evidenceEntry.dimension)
              ? evidenceEntry.dimension
              : 'direct',
          };
        });
      }

      if (
        !evidence.some(
          (e) => e.source === 'structured' && e.dimension === 'direct',
        )
      ) {
        evidence.unshift({
          text: `structured: direct_preference=${user.direct_preference} -> direct_weight=${direct_weight}`,
          source: 'structured',
          dimension: 'direct',
        });
      }
      if (
        !evidence.some(
          (e) => e.source === 'structured' && e.dimension === 'cost',
        )
      ) {
        evidence.unshift({
          text: `structured: price_sensitivity=${user.price_sensitivity} -> cost_weight=${cost_weight}`,
          source: 'structured',
          dimension: 'cost',
        });
      }
      if (
        preferredAirlines.length > 0 &&
        !evidence.some((e) => e.dimension === 'airline')
      ) {
        evidence.push({
          text: `structured: preferred airlines are ${preferredAirlines.join(', ')}`,
          source: 'structured',
          dimension: 'airline',
        });
      }
      if (
        user.preferred_cabin &&
        !evidence.some((e) => e.dimension === 'cabin')
      ) {
        evidence.push({
          text: `structured: preferred cabin is ${user.preferred_cabin}`,
          source: 'structured',
          dimension: 'cabin',
        });
      }

      return {
        user_id: user.user_id,
        direct_weight,
        cost_weight,
        convenience_weight,
        max_layover_minutes: Number(user.max_layover_minutes) || 240,
        date_flexibility_days: Number(user.date_flexibility_days) || 0,
        avoid_redeye,
        home_airport: user.home_airport,
        preferred_airlines: preferredAirlines,
        preferred_cabin: user.preferred_cabin,
        evidence,
      };
    } catch (err) {
      console.error('[CortexService] Preference parse failed:', err);
      warnings?.push(
        'Groq LLM rate-limited or API call failed. Using local preferences fallback.',
      );
      return null;
    }
  }
}
