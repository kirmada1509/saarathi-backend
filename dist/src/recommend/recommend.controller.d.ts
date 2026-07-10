import { TraceStage } from '../core/types';
export declare class RecommendController {
    getRecommendation(body: any): Promise<{
        mode: string;
        verdict: import("../core/types").ScoredFlight;
        ranked: import("../core/types").ScoredFlight[];
        preference: import("../core/types").InferredPreference;
        alternatives: import("../core/types").Alternative[];
        counterfactuals: {
            perturbation: {
                kind: "accept_one_stop";
            };
            label: string;
            newWinner: import("../core/types").ScoredFlight;
            flips: boolean;
        }[];
        confidence: import("../core/types").Confidence;
        trace: TraceStage[];
        explanation: string;
        itinerary: import("../core/types").MultiCityItinerary;
        appliedPerturbations: ({
            kind: "price_drop";
            flightId: string;
            toPrice: number;
        } | {
            kind: "accept_one_stop";
        } | {
            kind: "bags_matter";
        } | {
            kind: "evening_ok";
        } | {
            kind: "ignore_loyalty";
        } | {
            kind: "shift_dates";
            days: number;
        })[];
    } | {
        mode: string;
        verdict: null;
        ranked: never[];
        preference: import("../core/types").InferredPreference;
        alternatives: import("../core/types").Alternative[];
        counterfactuals: import("../core/types").Counterfactual[];
        confidence: import("../core/types").Confidence;
        trace: TraceStage[];
        explanation: string;
        appliedPerturbations: ({
            kind: "price_drop";
            flightId: string;
            toPrice: number;
        } | {
            kind: "accept_one_stop";
        } | {
            kind: "bags_matter";
        } | {
            kind: "evening_ok";
        } | {
            kind: "ignore_loyalty";
        } | {
            kind: "shift_dates";
            days: number;
        })[];
        itinerary?: undefined;
    } | {
        mode: string;
        verdict: import("../core/types").ScoredFlight;
        ranked: import("../core/types").ScoredFlight[];
        preference: import("../core/types").InferredPreference;
        alternatives: import("../core/types").Alternative[];
        counterfactuals: import("../core/types").Counterfactual[];
        confidence: import("../core/types").Confidence;
        trace: TraceStage[];
        explanation: string;
        appliedPerturbations: ({
            kind: "price_drop";
            flightId: string;
            toPrice: number;
        } | {
            kind: "accept_one_stop";
        } | {
            kind: "bags_matter";
        } | {
            kind: "evening_ok";
        } | {
            kind: "ignore_loyalty";
        } | {
            kind: "shift_dates";
            days: number;
        })[];
        itinerary?: undefined;
    }>;
}
