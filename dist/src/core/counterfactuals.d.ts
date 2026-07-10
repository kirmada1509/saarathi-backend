import { InferredPreference, ScoredFlight, FlightRow, Counterfactual, Perturbation } from "./types";
export declare function applyPerturbations(pref: InferredPreference, ps: Perturbation[]): InferredPreference;
export declare function computeCounterfactuals(ranked: ScoredFlight[], pref: InferredPreference, candidates: FlightRow[], opts?: {
    origin?: string;
    destination?: string;
    date?: string;
}): Counterfactual[];
