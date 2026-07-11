import { describe, it, expect, beforeAll } from 'vitest';
import { getStore } from './data';
import { inferPreferences } from './preferences';
import { filterAndRank, selectAlternatives } from './ranking';
import { computeCounterfactuals } from './counterfactuals';
import { computeConfidence } from './confidence';
import { explain } from './explain';
import { optimizeRoute } from './multicity';
import fs from 'fs';
import path from 'path';
import { FlightRow } from './types';

describe('Saarathi — End-to-End Benchmark Suite', () => {
  let store: ReturnType<typeof getStore>;
  let prompts: { prompt_id: string; user_id: string; request: string }[];

  beforeAll(() => {
    store = getStore();
    const promptsPath = path.join(
      process.cwd(),
      '../data/benchmark_prompts.json',
    );
    prompts = JSON.parse(
      fs.readFileSync(promptsPath, 'utf-8'),
    ) as typeof prompts;
  });

  it('should run B01 (User U01 to Tokyo) successfully', async () => {
    const prompt = prompts.find((p) => p.prompt_id === 'B01');
    expect(prompt).toBeDefined();

    const user = store.users.get(prompt!.user_id);
    expect(user).toBeDefined();

    const pref = await inferPreferences(user!);
    expect(pref.user_id).toBe('U01');
    expect(pref.direct_weight).toBe(1.0); // base 0.9 + 0.1 history boost
    expect(pref.max_layover_minutes).toBe(120);

    // Resolve Tokyo airport dynamically from the dataset
    const flightsFromCPT = store.flightsByOrigin.get(user!.home_airport) ?? [];
    const tokyoFlight = flightsFromCPT.find(
      (f: FlightRow) =>
        f.destination_city.toLowerCase() === 'tokyo' ||
        f.destination === 'HND' ||
        f.destination === 'NRT',
    );
    expect(tokyoFlight).toBeDefined();
    const destination = tokyoFlight!.destination;

    const routeFlights =
      store.flightsByRoute.get(`${user!.home_airport}-${destination}`) ?? [];
    expect(routeFlights.length).toBeGreaterThan(0);

    // Run decision engine
    const { ranked } = filterAndRank(routeFlights, pref, { destination });
    expect(ranked.length).toBeGreaterThan(0);

    const alternatives = selectAlternatives(ranked, user!);
    expect(alternatives.length).toBe(5);

    const counterfactuals = computeCounterfactuals(ranked, pref, routeFlights, {
      destination,
    });
    expect(counterfactuals.length).toBeGreaterThan(0);

    const confidence = computeConfidence(ranked, pref);
    expect(confidence.matchPct).toBeGreaterThan(0);

    // Run explain under fallback (unset GROQ_API_KEY)
    const oldKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const explanation = await explain(
        user!.user_id,
        prompt!.request,
        pref,
        ranked,
        alternatives,
        counterfactuals,
        confidence,
      );
      expect(explanation).toContain('U01');
      expect(explanation).toContain(ranked[0].airline_name);
    } finally {
      process.env.GROQ_API_KEY = oldKey;
    }
  });

  it('should run B02 (User U02 Multi-City LHR+CDG+FCO) successfully', async () => {
    const prompt = prompts.find((p) => p.prompt_id === 'B02');
    expect(prompt).toBeDefined();

    const user = store.users.get(prompt!.user_id);
    expect(user).toBeDefined();

    const pref = await inferPreferences(user!);
    expect(pref.direct_weight).toBe(0.15); // direct_preference="none" -> 0.15
    expect(pref.max_layover_minutes).toBe(420);

    // We tour London (LHR), Paris (CDG), and Rome (FCO)
    const cities = ['LHR', 'CDG', 'FCO'];
    const result = optimizeRoute(cities, pref);

    expect(result).not.toBeNull();
    const { itinerary, alternatives, counterfactualLabel } = result!;

    expect(itinerary.legs.length).toBe(4); // MEX -> P1 -> P2 -> P3 -> MEX
    expect(itinerary.cities.length).toBe(3);
    expect(alternatives.length).toBe(5);
    expect(counterfactualLabel).toBeDefined();
  });

  it('should run B03 (User U03 to Bali with Summer flexibility) successfully', async () => {
    const prompt = prompts.find((p) => p.prompt_id === 'B03');
    expect(prompt).toBeDefined();

    const user = store.users.get(prompt!.user_id);
    expect(user).toBeDefined();

    const pref = await inferPreferences(user!);
    expect(pref.direct_weight).toBe(0.9 + 0.1); // strong + history signals = 1.0 (clamped)
    expect(pref.max_layover_minutes).toBe(150);

    // Find Bali (DPS) flights from AMS
    const flightsFromAMS = store.flightsByOrigin.get(user!.home_airport) ?? [];
    const baliFlight = flightsFromAMS.find(
      (f: FlightRow) =>
        f.destination_city.toLowerCase() === 'bali' || f.destination === 'DPS',
    );
    expect(baliFlight).toBeDefined();
    const destination = baliFlight!.destination;

    const routeFlights =
      store.flightsByRoute.get(`${user!.home_airport}-${destination}`) ?? [];
    expect(routeFlights.length).toBeGreaterThan(0);

    const { ranked } = filterAndRank(routeFlights, pref, { destination });
    expect(ranked.length).toBeGreaterThan(0);

    const alternatives = selectAlternatives(ranked, user!);
    const dateShiftAlt = alternatives.find((a) => a.kind === 'date_shift')!;
    expect(dateShiftAlt).toBeDefined();
    // It is expected that the flight could be null if no other flights are within
    // the user's date_flexibility_days window in the dataset (which is the case for AMS-DPS).
    if (dateShiftAlt.flight) {
      expect(dateShiftAlt.gain).toContain('save');
    } else {
      expect(dateShiftAlt.gain).toBe('no alternative dates');
    }
  });

  it('should run B04 (User U04 to New York meeting) successfully', async () => {
    const prompt = prompts.find((p) => p.prompt_id === 'B04');
    expect(prompt).toBeDefined();

    const user = store.users.get(prompt!.user_id);
    expect(user).toBeDefined();

    const pref = await inferPreferences(user!);
    expect(pref.direct_weight).toBe(0.55); // moderate -> 0.55
    expect(pref.max_layover_minutes).toBe(300);

    // Find New York (JFK) flights from MEL
    const flightsFromMEL = store.flightsByOrigin.get(user!.home_airport) ?? [];
    const nyFlight = flightsFromMEL.find(
      (f: FlightRow) =>
        f.destination_city.toLowerCase() === 'new york' ||
        f.destination === 'JFK' ||
        f.destination === 'LGA' ||
        f.destination === 'EWR',
    );
    expect(nyFlight).toBeDefined();
    const destination = nyFlight!.destination;

    const routeFlights =
      store.flightsByRoute.get(`${user!.home_airport}-${destination}`) ?? [];
    expect(routeFlights.length).toBeGreaterThan(0);

    const { ranked } = filterAndRank(routeFlights, pref, { destination });
    expect(ranked.length).toBeGreaterThan(0);
  });

  it('should run B05 (User U05 to Sydney around Holidays) successfully', async () => {
    const prompt = prompts.find((p) => p.prompt_id === 'B05');
    expect(prompt).toBeDefined();

    const user = store.users.get(prompt!.user_id);
    expect(user).toBeDefined();

    const pref = await inferPreferences(user!);
    expect(pref.direct_weight).toBe(1.0); // base 0.9 + 0.1 history boost
    expect(pref.max_layover_minutes).toBe(90);

    // Find Sydney (SYD) flights from LIS (Lisbon)
    const flightsFromLIS = store.flightsByOrigin.get(user!.home_airport) ?? [];
    const sydFlight = flightsFromLIS.find(
      (f: FlightRow) =>
        f.destination_city.toLowerCase() === 'sydney' ||
        f.destination === 'SYD',
    );
    expect(sydFlight).toBeDefined();
    const destination = sydFlight!.destination;

    const routeFlights =
      store.flightsByRoute.get(`${user!.home_airport}-${destination}`) ?? [];
    expect(routeFlights.length).toBeGreaterThan(0);

    const { ranked } = filterAndRank(routeFlights, pref, { destination });
    // Expected empty because user has max_layover_minutes=90, but min layover in data is 105m
    expect(ranked.length).toBe(0);

    // The counterfactual engine should compute flips even on empty ranked sets
    const counterfactuals = computeCounterfactuals(ranked, pref, routeFlights, {
      destination,
    });
    const layoverCf = counterfactuals.find(
      (cf) => cf.perturbation.kind === 'accept_one_stop',
    );
    expect(layoverCf).toBeDefined();
    expect(layoverCf?.flips).toBe(true);
    expect(layoverCf?.newWinner).toBeDefined();
  });

  it('should run B06 (User U06 Multi-City Asia) successfully', async () => {
    const prompt = prompts.find((p) => p.prompt_id === 'B06');
    expect(prompt).toBeDefined();

    const user = store.users.get(prompt!.user_id);
    expect(user).toBeDefined();

    const pref = await inferPreferences(user!);
    expect(pref.direct_weight).toBe(0.15); // none -> 0.15
    expect(pref.max_layover_minutes).toBe(480);

    // Let's select two Asian cities connected from HND (Tokyo/Haneda)
    // Singapore (SIN) and Bangkok (BKK) are standard Asian hubs.
    const cities = ['SIN', 'BKK'];
    const result = optimizeRoute(cities, pref);

    expect(result).not.toBeNull();
    const { itinerary } = result!;
    expect(itinerary.legs.length).toBe(3); // HND -> SIN -> BKK -> HND
    expect(itinerary.cities.length).toBe(2);
  });
});
