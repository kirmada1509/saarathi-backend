import { describe, it, expect } from 'vitest';
import { getStore } from './data';
import { inferPreferences } from './preferences';
import { optimizeRoute } from './multicity';

describe('Multi-city Optimizer Module', () => {
  it('should optimize route order and enforce temporal turnaround sanity', async () => {
    const store = getStore();
    const u04 = store.users.get('U04')!; // MEL home, multi_city_tendency='high'
    const pref = await inferPreferences(u04);

    // Let's plan a journey: MEL -> LHR -> CDG -> MEL (London + Paris)
    const cities = ['LHR', 'CDG'];
    const result = optimizeRoute(cities, pref);

    expect(result).not.toBeNull();
    const { itinerary, alternatives, counterfactualLabel } = result!;

    expect(itinerary.legs.length).toBe(3); // MEL->LHR, LHR->CDG, CDG->MEL (or vice-versa)
    expect(itinerary.cities.length).toBe(2);

    // Verify temporal turnaround sanity: departure of leg i+1 >= arrival of leg i + 12h
    for (let i = 0; i < itinerary.legs.length - 1; i++) {
      const currentArr = new Date(
        itinerary.legs[i].flight.arrival_utc,
      ).getTime();
      const nextDep = new Date(
        itinerary.legs[i + 1].flight.departure_utc,
      ).getTime();
      const gapMinutes = (nextDep - currentArr) / (1000 * 60);
      expect(gapMinutes).toBeGreaterThanOrEqual(720); // 12 hours
    }

    expect(alternatives.length).toBe(5);
    expect(counterfactualLabel).toBeDefined();
    console.log(
      '[Multi-City Test] Optimized routing order:',
      itinerary.cities.join(' -> '),
    );
    console.log('[Multi-City Test] Counterfactual label:', counterfactualLabel);
  });
});
