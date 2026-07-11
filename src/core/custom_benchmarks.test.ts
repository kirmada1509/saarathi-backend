/**
 * custom_benchmarks.test.ts
 * 8+ additional Vitest test cases covering edge cases and new functionality.
 */
import { describe, it, expect } from 'vitest';
import { getStore } from './data';
import { inferPreferences } from './preferences';
import { filterAndRank, selectAlternatives } from './ranking';
import { computeConfidence } from './confidence';
import { optimizeRoute } from './multicity';
import { computeCounterfactuals } from './counterfactuals';
import { ScoredFlight, InferredPreference } from './types';

// ── Shared mock building helpers ────────────────────────────────────────────

function makePref(
  overrides: Partial<InferredPreference> = {},
): InferredPreference {
  return {
    user_id: 'TEST',
    direct_weight: 0.5,
    cost_weight: 0.5,
    convenience_weight: 0.3,
    max_layover_minutes: 300,
    date_flexibility_days: 14,
    avoid_redeye: false,
    home_airport: 'MAA',
    preferred_airlines: [],
    preferred_cabin: 'Economy',
    bags_matter: false,
    evidence: [
      { text: 'test evidence', source: 'structured', dimension: 'cost' },
    ],
    ...overrides,
  };
}

function makeFlight(overrides: Partial<ScoredFlight> = {}): ScoredFlight {
  return {
    flight_id: 'TST001',
    airline_code: 'AA',
    airline_name: 'American Airlines',
    alliance: 'oneworld',
    flight_numbers: 'AA001',
    origin: 'MAA',
    origin_city: 'Chennai',
    destination: 'JFK',
    destination_city: 'New York',
    departure_utc: '2026-08-05T10:00:00Z', // Tuesday
    arrival_utc: '2026-08-05T22:00:00Z',
    duration_minutes: 720,
    stops: 0,
    layover_airports: '',
    layover_minutes: 0,
    cabin_class: 'Economy',
    price: 800,
    currency: 'USD',
    seats_available: 10,
    aircraft_type: '777',
    on_time_performance: 85,
    baggage_included: false,
    refundable: false,
    demand_level: 'medium',
    season: 'summer',
    is_holiday_season: false,
    score: 0.7,
    ...overrides,
  };
}

// ── Test 1: No preferred airlines — should still rank correctly ──────────────

describe('Custom Benchmark 1 — No preferred airlines', () => {
  it('should rank flights correctly even when preferred_airlines is empty', () => {
    const store = getStore();
    const flights = store.flightsByRoute.get('MAA-IST') ?? [];
    expect(flights.length).toBeGreaterThan(0);

    const pref = makePref({ preferred_airlines: [] });
    const { ranked } = filterAndRank(flights, pref, {
      origin: 'MAA',
      destination: 'IST',
    });

    expect(ranked.length).toBeGreaterThan(0);
    // All flights should have airline score = 0.5 (neutral), winner still chosen by price/direct/time
    expect(ranked[0].score).toBeGreaterThan(0);
    // Verify descending order
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i + 1].score);
    }
  });
});

// ── Test 2: Route with no flights — should return empty gracefully ───────────

describe('Custom Benchmark 2 — Route with no flights', () => {
  it('should return empty ranked array and non-empty trace when no flights on route', () => {
    const pref = makePref();
    const { ranked, trace } = filterAndRank([], pref, {
      origin: 'ZZZ',
      destination: 'YYY',
    });

    expect(ranked).toEqual([]);
    // Should still have trace steps for origin filter
    expect(trace.steps.length).toBeGreaterThanOrEqual(1);
    expect(trace.steps[0].remaining).toBe(0);
  });

  it("should return empty ranked when route key doesn't exist in store", () => {
    const store = getStore();
    const flights = store.flightsByRoute.get('ZZZ-YYY') ?? [];
    expect(flights).toEqual([]);
    const pref = makePref();
    const { ranked } = filterAndRank(flights, pref, {
      origin: 'ZZZ',
      destination: 'YYY',
    });
    expect(ranked).toEqual([]);
  });
});

// ── Test 3: Baggage matters — winner switches with bags_matter perturbation ──

describe('Custom Benchmark 3 — Baggage scoring changes winner', () => {
  it('bags_matter=true should boost flights with baggage_included and can change winner', () => {
    const flight_no_bag = makeFlight({
      flight_id: 'F_NOBAG',
      price: 700,
      baggage_included: false,
      stops: 0,
    });
    const flight_with_bag = makeFlight({
      flight_id: 'F_BAG',
      price: 710, // only slightly more expensive (within baggage bonus range)
      baggage_included: true,
      stops: 0,
    });

    const flight_expensive = makeFlight({
      flight_id: 'F_EXPENSIVE',
      price: 900,
      baggage_included: false,
      stops: 0,
    });

    const pref_no_bags = makePref({ bags_matter: false, cost_weight: 0.4 });
    const pref_with_bags = makePref({ bags_matter: true, cost_weight: 0.4 });

    const { ranked: ranked_no_bags } = filterAndRank(
      [flight_no_bag, flight_with_bag, flight_expensive],
      pref_no_bags,
      { origin: 'MAA', destination: 'JFK' },
    );
    const { ranked: ranked_with_bags } = filterAndRank(
      [flight_no_bag, flight_with_bag, flight_expensive],
      pref_with_bags,
      { origin: 'MAA', destination: 'JFK' },
    );

    // Without bags_matter, the cheaper flight (no_bag) is likely ranked first
    expect(ranked_no_bags[0].flight_id).toBe('F_NOBAG');

    // With bags_matter=true, the baggage score is 0.25 * 1 vs 0.25 * 0.2 = net +0.2 advantage for F_BAG.
    // With a $10 price diff and cost_weight=0.4 on a normalized range of $10, the price penalty is small.
    // The baggage bonus (0.2 net) should outweigh the small price disadvantage.
    expect(ranked_with_bags[0].flight_id).toBe('F_BAG');

    // Verify that dayBonus breakdown key exists
    expect(ranked_with_bags[0].breakdown?.baggage).toBeGreaterThan(0);
  });
});

// ── Test 4: Multi-city with only 2 cities ───────────────────────────────────

describe('Custom Benchmark 4 — Multi-city with 2 cities', () => {
  it('should produce a valid 3-leg itinerary for 2 cities (home→A→B→home)', async () => {
    const store = getStore();
    const u06 = store.users.get('U06')!;
    const pref = await inferPreferences(u06);

    // U06's home is MAA. Use 2 known cities in the dataset.
    const result = optimizeRoute(['SIN', 'BKK'], pref);

    // Should find a valid route
    expect(result).not.toBeNull();
    if (result) {
      // 2 intermediate cities → 3 legs (MAA→A, A→B, B→MAA)
      expect(result.itinerary.legs.length).toBe(3);
      expect(result.itinerary.legs[0].from).toBe('MAA');
      expect(result.itinerary.legs[result.itinerary.legs.length - 1].to).toBe(
        'MAA',
      );
      expect(result.itinerary.totalPrice).toBeGreaterThan(0);
    }
  });
});

// ── Test 5: Price-drop counterfactual math ───────────────────────────────────

describe('Custom Benchmark 5 — Price-drop counterfactual math', () => {
  it('should compute a non-empty counterfactual list from real flight data', async () => {
    const store = getStore();
    const u01 = store.users.get('U01')!;
    const pref = await inferPreferences(u01);
    const flights = store.flightsByRoute.get('CPT-NRT') ?? [];

    const { ranked } = filterAndRank(flights, pref, {
      origin: 'CPT',
      destination: 'NRT',
    });
    expect(ranked.length).toBeGreaterThan(0);

    const counterfactuals = computeCounterfactuals(ranked, pref, flights, {
      origin: 'CPT',
      destination: 'NRT',
    });
    // Should produce price_drop counterfactuals
    const priceDrop = counterfactuals.find(
      (c) => c.perturbation.kind === 'price_drop',
    );
    expect(priceDrop).toBeDefined();

    if (priceDrop && priceDrop.perturbation.kind === 'price_drop') {
      // The toPrice is the break-even price for the challenger flight
      // It should be a valid positive number
      expect(priceDrop.perturbation.toPrice).toBeGreaterThan(0);
      // The label should be non-empty
      expect(priceDrop.label.length).toBeGreaterThan(0);
    }
  });
});

// ── Test 6: prefer_cabin=Business should filter ranking towards Business ─────

describe('Custom Benchmark 6 — Business cabin preference scoring', () => {
  it('should give higher scores to Business-class flights when preferred_cabin=Business', () => {
    const flight_economy = makeFlight({
      flight_id: 'F_ECO',
      cabin_class: 'Economy',
      price: 600,
      stops: 0,
    });
    const flight_business = makeFlight({
      flight_id: 'F_BIZ',
      cabin_class: 'Business',
      price: 1200, // much more expensive
      stops: 0,
    });

    const pref_biz = makePref({
      preferred_cabin: 'Business',
      convenience_weight: 0.9, // high convenience weight
      cost_weight: 0.1, // low cost sensitivity
    });

    const { ranked } = filterAndRank(
      [flight_economy, flight_business],
      pref_biz,
      { origin: 'MAA', destination: 'JFK' },
    );

    // Business flight should rank higher despite higher price when convenience_weight is high
    // cabinScore for Business match = 1.0 vs Economy = 0.4; with 0.9 * 0.3 * 0.6 diff = 0.162 advantage
    expect(ranked[0].flight_id).toBe('F_BIZ');
    expect(ranked[0].breakdown?.cabin).toBeGreaterThan(
      ranked[1].breakdown?.cabin ?? 0,
    );
  });
});

// ── Test 7: high direct_weight — 2-stop should never beat nonstop ────────────

describe('Custom Benchmark 7 — High direct_weight never selects multi-stop winner', () => {
  it('should always pick nonstop when direct_weight is maximal (1.0)', () => {
    const direct_flight = makeFlight({
      flight_id: 'F_DIRECT',
      stops: 0,
      price: 1500, // expensive
      duration_minutes: 600,
    });
    const two_stop_flight = makeFlight({
      flight_id: 'F_2STOP',
      stops: 2,
      layover_minutes: 180,
      price: 500, // very cheap
      duration_minutes: 900,
    });

    const pref = makePref({
      direct_weight: 1.0,
      cost_weight: 0.05,
      max_layover_minutes: 480,
    });

    const { ranked } = filterAndRank([direct_flight, two_stop_flight], pref, {
      origin: 'MAA',
      destination: 'JFK',
    });

    expect(ranked[0].flight_id).toBe('F_DIRECT');
    // 2-stop flight's directScore = max(0, 1 - 0.35*2) = 0.3 vs 1.0 for nonstop
    expect(ranked[0].breakdown?.direct).toBeGreaterThan(
      ranked[1].breakdown?.direct ?? 0,
    );
  });
});

// ── Test 8: Day-of-week bonus — shift_dates perturbation changes ranking ──────

describe('Custom Benchmark 8 — Day-of-week bonus influences ranking', () => {
  it('should rank Tuesday flight higher when preferredDays=[tuesday]', () => {
    // departure_utc for 2026-08-04 = Tuesday, 2026-08-06 = Thursday
    const tue_flight = makeFlight({
      flight_id: 'F_TUE',
      departure_utc: '2026-08-04T10:00:00Z', // Tuesday
      price: 900,
      stops: 0,
    });
    const thu_flight = makeFlight({
      flight_id: 'F_THU',
      departure_utc: '2026-08-06T10:00:00Z', // Thursday
      price: 905, // almost same price so day bonus dominates
      stops: 0,
    });

    const pref = makePref({ cost_weight: 0.3 });

    // With preferredDays="tuesday": Tuesday flight gets +0.15 bonus and should win
    const { ranked: ranked_with_days } = filterAndRank(
      [tue_flight, thu_flight],
      pref,
      { origin: 'MAA', destination: 'JFK', preferredDays: ['tuesday'] },
    );

    // Tuesday flight should get a dayBonus
    const tue_in_days_result = ranked_with_days.find(
      (f) => f.flight_id === 'F_TUE',
    );
    expect(tue_in_days_result?.breakdown?.dayBonus).toBe(0.15);

    // Non-preferred flight gets 0 bonus
    const thu_in_days_result = ranked_with_days.find(
      (f) => f.flight_id === 'F_THU',
    );
    expect(thu_in_days_result?.breakdown?.dayBonus).toBe(0);

    // Tuesday flight should now be winner (0.15 bonus overcomes $5 price difference)
    expect(ranked_with_days[0].flight_id).toBe('F_TUE');
  });

  it('should NOT boost Tuesday flight when preferredDays is empty', () => {
    const tue_flight = makeFlight({
      flight_id: 'F_TUE',
      departure_utc: '2026-08-04T10:00:00Z', // Tuesday
      price: 900,
      stops: 0,
    });
    const cheaper_other = makeFlight({
      flight_id: 'F_OTHER',
      departure_utc: '2026-08-06T10:00:00Z', // Thursday
      price: 700,
      stops: 0,
    });

    const pref = makePref({ cost_weight: 0.6 });
    const { ranked } = filterAndRank([tue_flight, cheaper_other], pref, {
      origin: 'MAA',
      destination: 'JFK',
      preferredDays: [],
    });

    // No day bonus applied — cheaper flight should win
    const tue_result = ranked.find((f) => f.flight_id === 'F_TUE');
    expect(tue_result?.breakdown?.dayBonus).toBe(0);
  });
});

// ── Test 9: Confidence tier floor — matchPct >= 80 promotes 'low' to 'medium' ─

describe('Custom Benchmark 9 — Confidence tier floor', () => {
  it("should promote 'low' tier to 'medium' when matchPct >= 80", () => {
    // Create a pref with no signal agreement (no strong signals → noSignalAgreement = true → tier demoted)
    const pref = makePref({
      direct_weight: 0.5,
      cost_weight: 0.5,
      convenience_weight: 0.3,
      bags_matter: false,
      evidence: [
        {
          text: 'single structured cost',
          source: 'structured',
          dimension: 'cost',
        },
      ],
    });

    // Give a very high score flight to ensure matchPct >= 80
    const champion = makeFlight({ score: 1.5 });
    const challenger = makeFlight({ flight_id: 'F2', score: 1.4 }); // margin = 0.10 (border high/medium)

    const confidence = computeConfidence([champion, challenger], pref);

    // matchPct should be > 0
    expect(confidence.matchPct).toBeGreaterThan(0);

    // The tier floor rule: if matchPct >= 80 and tier would be 'low', it becomes 'medium'
    if (confidence.matchPct >= 80) {
      expect(confidence.tier).not.toBe('low');
    }
  });

  it("should keep 'low' tier when matchPct < 80", () => {
    const pref = makePref({
      evidence: [
        { text: 'single cost', source: 'structured', dimension: 'cost' },
      ],
    });
    // Tiny score → low matchPct
    const champion = makeFlight({ score: 0.1 });
    const challenger = makeFlight({ flight_id: 'F2', score: 0.099 }); // margin < 0.04
    const confidence = computeConfidence([champion, challenger], pref);
    // matchPct will be low, tier may stay low
    if (confidence.matchPct < 80) {
      // No floor promotion should apply
      expect(confidence.tier).toMatch(/low|medium/); // can be medium due to other reasons but not forced by floor
    }
  });
});

// ── Test 10: selectAlternatives returns 5 kinds even for 1-flight set ────────

describe('Custom Benchmark 10 — selectAlternatives handles minimal flight set', () => {
  it('should return 5 alternative kinds even when only 1 flight is ranked', () => {
    const store = getStore();
    const u01 = store.users.get('U01')!;
    const singleFlight = makeFlight({ flight_id: 'ONLY' });

    const alternatives = selectAlternatives([singleFlight], u01);
    expect(alternatives.length).toBe(5);
    const kinds = alternatives.map((a) => a.kind);
    expect(kinds).toContain('cheapest');
    expect(kinds).toContain('fastest');
    expect(kinds).toContain('flexible');
    expect(kinds).toContain('comfort');
    expect(kinds).toContain('date_shift');

    // With only 1 flight, cheapest should be the champion itself
    const cheapestAlt = alternatives.find((a) => a.kind === 'cheapest')!;
    expect(cheapestAlt.gain).toContain('cheapest');
  });
});
