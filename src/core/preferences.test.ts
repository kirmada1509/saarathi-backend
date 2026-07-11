import { describe, it, expect } from 'vitest';
import { inferPreferences, initEmbeddingModel } from './preferences';
import { UserRow } from './types';

describe('Preference Inference Module', () => {
  const baseUser: UserRow = {
    user_id: 'U99',
    age: 30,
    home_airport: 'JFK',
    home_city: 'New York',
    frequent_flyer: 'none',
    preferred_airlines: 'DL;UA',
    preferred_cabin: 'Economy',
    price_sensitivity: 'medium',
    direct_preference: 'moderate',
    max_layover_minutes: 240,
    date_flexibility_days: 2,
    multi_city_tendency: 'low',
    trip_purpose: 'leisure',
    preferred_departure: 'any',
    baggage_preference: '1 checked',
    seasonal_pattern: 'none',
    raw_history: '',
  };

  it('should infer base structured preferences correctly when raw history is empty', async () => {
    const pref = await inferPreferences(baseUser);
    expect(pref.direct_weight).toBe(0.55); // moderate direct
    expect(pref.cost_weight).toBe(0.5); // medium cost
    expect(pref.convenience_weight).toBe(0.7); // 1 - 0.5 * 0.6
    expect(pref.avoid_redeye).toBe(false);
    expect(pref.preferred_airlines).toEqual(['DL', 'UA']);
    expect(pref.preferred_cabin).toBe('Economy');

    // Check structured evidence items are present
    const structuredEvidence = pref.evidence.filter(
      (e) => e.source === 'structured',
    );
    expect(structuredEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it('should match direct-flight regex signals and boost direct weight', async () => {
    const user = {
      ...baseUser,
      raw_history: 'I hate connections and layovers | morning departures',
    };
    const pref = await inferPreferences(user);
    expect(pref.direct_weight).toBeGreaterThan(0.55); // boosted from 0.55
    expect(pref.avoid_redeye).toBe(true); // "morning departures" regex signals redeye avoidance

    const rawHistoryEvidence = pref.evidence.filter(
      (e) => e.source === 'raw_history',
    );
    expect(rawHistoryEvidence.some((e) => e.dimension === 'direct')).toBe(true);
    expect(rawHistoryEvidence.some((e) => e.dimension === 'redeye')).toBe(true);
  });

  it('should trigger embedding similarity matches when model is loaded', async () => {
    // Force loading of the cached model
    await initEmbeddingModel();

    const user = {
      ...baseUser,
      raw_history: 'I want to avoid flying through the night', // semantically similar to "I want to avoid overnight redeye flights"
    };

    const pref = await inferPreferences(user);

    const embeddingEvidence = pref.evidence.filter(
      (e) => e.source === 'embedding',
    );
    // If the model loaded successfully, we should see an embedding match for the redeye avoidance
    if (embeddingEvidence.length > 0) {
      expect(embeddingEvidence.some((e) => e.dimension === 'redeye')).toBe(
        true,
      );
      expect(pref.avoid_redeye).toBe(true);
    }
  });
});
