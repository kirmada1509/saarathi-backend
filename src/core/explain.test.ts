import { describe, it, expect } from 'vitest';
import { explain } from './explain';
import {
  InferredPreference,
  ScoredFlight,
  Alternative,
  Counterfactual,
  Confidence,
} from './types';

describe('Explanation Module tests', () => {
  const pref: InferredPreference = {
    user_id: 'U01',
    direct_weight: 0.9,
    cost_weight: 0.2,
    convenience_weight: 0.88,
    max_layover_minutes: 120,
    date_flexibility_days: 1,
    avoid_redeye: true,
    home_airport: 'CPT',
    preferred_airlines: ['AA'],
    preferred_cabin: 'Business',
    evidence: [
      {
        text: 'always book business',
        source: 'raw_history',
        dimension: 'cabin',
      },
    ],
  };

  const ranked: ScoredFlight[] = [
    {
      flight_id: 'F1',
      airline_code: 'AA',
      airline_name: 'American Airlines',
      alliance: 'oneworld',
      flight_numbers: 'AA1',
      origin: 'CPT',
      origin_city: 'Cape Town',
      destination: 'JFK',
      destination_city: 'New York',
      departure_utc: '2026-05-23T10:00:00Z',
      arrival_utc: '2026-05-23T20:00:00Z',
      duration_minutes: 600,
      stops: 0,
      layover_airports: '',
      layover_minutes: 0,
      cabin_class: 'Business',
      price: 1000,
      currency: 'USD',
      seats_available: 5,
      aircraft_type: '777',
      on_time_performance: 90,
      baggage_included: true,
      refundable: true,
      demand_level: 'low',
      season: 'shoulder',
      is_holiday_season: false,
      score: 1.25,
    },
  ];

  const alternatives: Alternative[] = [
    {
      kind: 'cheapest',
      flight: null,
      gain: 'You have the cheapest flight',
      cost: '',
      deltaPrice: 0,
      deltaMinutes: 0,
    },
  ];

  const counterfactuals: Counterfactual[] = [];

  const confidence: Confidence = {
    matchPct: 92,
    tier: 'high',
    strongSignals: ['Direct flight preference'],
    weakSignals: [],
  };

  it('should fall back to a deterministic explanation when GROQ_API_KEY is not set', async () => {
    // Temporarily unset GROQ_API_KEY if present
    const oldKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      const explanation = await explain(
        'U01',
        'Get me to JFK',
        pref,
        ranked,
        alternatives,
        counterfactuals,
        confidence,
      );

      expect(explanation).toContain('U01');
      expect(explanation).toContain('American Airlines');
      expect(explanation).toContain('always book business');
      expect(explanation).toContain('92%');
      expect(explanation).toContain('high');
    } finally {
      process.env.GROQ_API_KEY = oldKey;
    }
  });
});
