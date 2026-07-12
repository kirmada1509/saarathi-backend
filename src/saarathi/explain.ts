/**
 * explain.ts
 * The only LLM-touching module in the system. Turns the ranked shortlist,
 * evidence trail, alternatives, counterfactuals, and confidence ratings
 * into a grounded, plain-English explanation via Groq.
 *
 * If GROQ_API_KEY isn't set or calls fail, falls back to a deterministic
 * template so the app never breaks.
 */
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatGroq } from '@langchain/groq';
import {
  InferredPreference,
  ScoredFlight,
  Alternative,
  Counterfactual,
  Confidence,
} from './types';

const PROMPT =
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

function formatOptions(ranked: ScoredFlight[], topN = 3): string {
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

function formatAlternatives(alternatives: Alternative[]): string {
  return alternatives
    .map((alt) => `- ${alt.kind}: ${alt.gain} (cost: ${alt.cost || 'none'})`)
    .join('\n');
}

function formatCounterfactuals(cfs: Counterfactual[]): string {
  return cfs
    .map((cf) => `- ${cf.label} (${cf.flips ? 'FLIPS winner' : 'no flip'})`)
    .join('\n');
}

function fallbackExplanation(
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

export async function explain(
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return fallbackExplanation(userId, pref, ranked, confidence);
  }

  try {
    const model = new ChatGroq({
      apiKey,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
    });

    const chain = PROMPT.pipe(model).pipe(new StringOutputParser());

    const evidenceList = pref.evidence
      .map((e) => `- [${e.source} / ${e.dimension}] ${e.text}`)
      .join('\n');

    return await chain.invoke({
      userId,
      requestText,
      evidence: evidenceList,
      options: formatOptions(ranked),
      alternatives: formatAlternatives(alternatives),
      counterfactuals: formatCounterfactuals(counterfactuals),
      matchPct: confidence.matchPct,
      confidenceTier: confidence.tier,
    });
  } catch (err) {
    console.error('Groq explanation call failed, using fallback:', err);
    return fallbackExplanation(userId, pref, ranked, confidence);
  }
}
