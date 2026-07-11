export interface UserRow {
    user_id: string;
    age: number;
    home_airport: string;
    home_city: string;
    frequent_flyer: string;
    preferred_airlines: string;
    preferred_cabin: string;
    price_sensitivity: 'low' | 'medium' | 'high' | 'none';
    direct_preference: 'strong' | 'moderate' | 'none';
    max_layover_minutes: number;
    date_flexibility_days: number;
    multi_city_tendency: 'low' | 'medium' | 'high';
    trip_purpose: string;
    preferred_departure: string;
    baggage_preference: string;
    seasonal_pattern: string;
    raw_history: string;
}
export interface FlightRow {
    flight_id: string;
    airline_code: string;
    airline_name: string;
    alliance: string;
    flight_numbers: string;
    origin: string;
    origin_city: string;
    destination: string;
    destination_city: string;
    departure_utc: string;
    arrival_utc: string;
    duration_minutes: number;
    stops: number;
    layover_airports: string;
    layover_minutes: number;
    cabin_class: string;
    price: number;
    currency: string;
    seats_available: number;
    aircraft_type: string;
    on_time_performance: number;
    baggage_included: boolean;
    refundable: boolean;
    demand_level: 'low' | 'medium' | 'high';
    season: string;
    is_holiday_season: boolean;
}
export interface EvidenceItem {
    text: string;
    source: 'structured' | 'raw_history' | 'embedding';
    dimension: 'direct' | 'cost' | 'convenience' | 'redeye' | 'airline' | 'cabin';
}
export interface FilterTrace {
    steps: {
        constraint: string;
        removed: number;
        remaining: number;
    }[];
}
export interface InferredPreference {
    user_id: string;
    direct_weight: number;
    cost_weight: number;
    convenience_weight: number;
    max_layover_minutes: number;
    date_flexibility_days: number;
    avoid_redeye: boolean;
    home_airport: string;
    preferred_airlines: string[];
    preferred_cabin: string;
    evidence: EvidenceItem[];
    bags_matter?: boolean;
    date_flexibility_days_override?: number;
}
export interface ScoredFlight extends FlightRow {
    score: number;
    breakdown?: Record<string, number>;
}
export interface TradeOff {
    summary: string;
    direct?: ScoredFlight;
    cheapestOneStop?: ScoredFlight;
    priceDiff?: number;
    timeSavedHrs?: number;
}
export interface MultiCityLeg {
    from: string;
    to: string;
    flight: ScoredFlight;
}
export interface MultiCityItinerary {
    legs: MultiCityLeg[];
    totalPrice: number;
    totalDurationMinutes: number;
    cities: string[];
}
export type Perturbation = {
    kind: 'price_drop';
    flightId: string;
    toPrice: number;
} | {
    kind: 'accept_one_stop';
} | {
    kind: 'bags_matter';
} | {
    kind: 'evening_ok';
} | {
    kind: 'ignore_loyalty';
} | {
    kind: 'shift_dates';
    days: number;
};
export interface Counterfactual {
    perturbation: Perturbation;
    label: string;
    newWinner: ScoredFlight;
    flips: boolean;
}
export interface Confidence {
    matchPct: number;
    tier: 'high' | 'medium' | 'low';
    strongSignals: string[];
    weakSignals: string[];
}
export interface TraceStage {
    id: 'request' | 'preferences' | 'constraints' | 'candidates' | 'tradeoffs' | 'counterfactuals' | 'verdict';
    label: string;
    payload: unknown;
}
export interface Alternative {
    kind: 'cheapest' | 'fastest' | 'flexible' | 'comfort' | 'date_shift';
    flight: FlightRow | null;
    gain: string;
    cost: string;
    deltaPrice: number;
    deltaMinutes: number;
}
export interface RecommendResponse {
    mode: 'single-leg' | 'multi-city';
    verdict: ScoredFlight | null;
    ranked: ScoredFlight[];
    preference: InferredPreference;
    alternatives: Alternative[];
    counterfactuals: Counterfactual[];
    confidence: Confidence;
    trace: TraceStage[];
    explanation: string;
    itinerary?: MultiCityItinerary;
    appliedPerturbations: Perturbation[];
}
