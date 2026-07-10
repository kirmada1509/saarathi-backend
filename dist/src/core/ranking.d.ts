import { FlightRow, UserRow, InferredPreference, ScoredFlight, FilterTrace, Alternative, Perturbation } from "./types";
export declare function filterAndRank(flights: FlightRow[], pref: InferredPreference, opts?: {
    origin?: string;
    destination?: string;
    date?: string;
    perturbations?: Perturbation[];
}): {
    ranked: ScoredFlight[];
    trace: FilterTrace;
};
export declare function selectAlternatives(ranked: ScoredFlight[], user: UserRow): Alternative[];
