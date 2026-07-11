import { describe, it, expect } from 'vitest';
import { computeConfidence } from './confidence';
import { ScoredFlight, InferredPreference } from './types';

describe('Confidence Module tests', () => {
  const basePref: InferredPreference = {
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
      { text: 'structured DL', source: 'structured', dimension: 'direct' },
      {
        text: 'raw_history connection dislike',
        source: 'raw_history',
        dimension: 'direct',
      }, // strong signal
      { text: 'structured cost', source: 'structured', dimension: 'cost' }, // weak signal (no history confirmation)
    ],
  };

  const mockFlight1: ScoredFlight = {
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
    score: 1.25, // Mock score
  };

  const mockFlight2: ScoredFlight = {
    ...mockFlight1,
    flight_id: 'F2',
    score: 1.12, // Gap > 0.10
  };

  const mockFlight3: ScoredFlight = {
    ...mockFlight1,
    flight_id: 'F3',
    score: 1.23, // Gap < 0.04
  };

  it('should calculate match percentage and strong/weak signals correctly', () => {
    const confidence = computeConfidence([mockFlight1, mockFlight2], basePref);
    expect(confidence.matchPct).toBeGreaterThan(0);
    expect(confidence.matchPct).toBeLessThanOrEqual(100);

    // Direct preference should be a strong signal (both structured and history evidence)
    expect(confidence.strongSignals).toContain('Direct flight preference');
    // Cost preference should be a weak signal (only structured evidence)
    expect(confidence.weakSignals).toContain('Price sensitivity');
  });

  it('should evaluate confidence tiers correctly based on score margin', () => {
    // Gap = 1.25 - 1.12 = 0.13 (> 0.10) -> High
    const highConf = computeConfidence([mockFlight1, mockFlight2], basePref);
    expect(highConf.tier).toBe('high');

    // Gap = 1.25 - 1.23 = 0.02 (< 0.04) -> Low
    const lowConf = computeConfidence([mockFlight1, mockFlight3], basePref);
    expect(lowConf.tier).toBe('low');
  });
});
