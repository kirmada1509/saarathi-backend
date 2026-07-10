export interface UserRow {
  user_id: string;
  age: number;
  home_airport: string;
  home_city: string;
  frequent_flyer: string;
  preferred_airlines: string; // semicolon-delimited
  preferred_cabin: string;
  price_sensitivity: "low" | "medium" | "high" | "none";
  direct_preference: "strong" | "moderate" | "none";
  max_layover_minutes: number;
  date_flexibility_days: number;
  multi_city_tendency: "low" | "medium" | "high";
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
  demand_level: "low" | "medium" | "high";
  season: string;
  is_holiday_season: boolean;
}

export interface EvidenceItem {
  text: string;                      // human-readable, rendered verbatim in zone 2
  source: "structured" | "raw_history" | "embedding";
  dimension: "direct" | "cost" | "convenience" | "redeye" | "airline" | "cabin";
}

export interface FilterTrace {
  steps: { constraint: string; removed: number; remaining: number }[];
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
  breakdown?: Record<string, number>; // per-component score contributions
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

// Additional type definitions for counterfactuals
export type Perturbation =
  | { kind: "price_drop"; flightId: string; toPrice: number }
  | { kind: "accept_one_stop" }
  | { kind: "bags_matter" }
  | { kind: "evening_ok" }
  | { kind: "ignore_loyalty" }
  | { kind: "shift_dates"; days: number };

export interface Counterfactual {
  perturbation: Perturbation;
  label: string;               // e.g., "United 88 wins if its fare drops below $543"
  newWinner: ScoredFlight;
  flips: boolean;              // trace panel also shows the ones that DIDN'T flip
}

export interface Confidence {
  matchPct: number;            // score(#1) / maxAchievableScore(pref)
  tier: "high" | "medium" | "low";   // margin(#1,#2) * signal agreement
  strongSignals: string[];     // dimension supported by >= 2 evidence sources -> checkmark
  weakSignals: string[];       // single-source or conflicting -> dot
}

export interface TraceStage {
  id: "request" | "preferences" | "constraints" | "candidates" | "tradeoffs" | "counterfactuals" | "verdict";
  label: string;
  payload: unknown;            // the real data: evidence[], FilterTrace, breakdowns, non-flips
}

export interface Alternative {
  kind: "cheapest" | "fastest" | "flexible" | "comfort" | "date_shift";
  flight: FlightRow | null;    // null -> honest empty state ("no refundable options")
  gain: string;                // e.g., "save $120" | "arrive 2h earlier" | "refundable"
  cost: string;                // e.g., "+5.1h" | "+$260"
  deltaPrice: number;
  deltaMinutes: number;
}

export interface RecommendResponse {
  mode: "single-leg" | "multi-city";
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
