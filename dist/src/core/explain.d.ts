import { InferredPreference, ScoredFlight, Alternative, Counterfactual, Confidence } from './types';
export declare function explain(userId: string, requestText: string, pref: InferredPreference, ranked: ScoredFlight[], alternatives: Alternative[], counterfactuals: Counterfactual[], confidence: Confidence): Promise<string>;
