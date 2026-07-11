import { InferredPreference, MultiCityItinerary, Alternative } from './types';
export declare function optimizeRoute(cities: string[], pref: InferredPreference): {
    itinerary: MultiCityItinerary;
    alternatives: Alternative[];
    counterfactualLabel: string;
    scoreGap: number;
} | null;
