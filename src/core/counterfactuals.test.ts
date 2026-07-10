import { describe, it, expect } from "vitest";
import { getStore } from "./data";
import { inferPreferences } from "./preferences";
import { filterAndRank } from "./ranking";
import { computeCounterfactuals, applyPerturbations } from "./counterfactuals";
import { FlightRow, InferredPreference } from "./types";

describe("Counterfactuals Module — Break-even Math & Flips", () => {
  // In-memory mock fixture for isolated algebraic validation
  const mockPref: InferredPreference = {
    user_id: "UTest",
    direct_weight: 0.5,
    cost_weight: 0.8, // high cost weight to trigger realistic flips
    convenience_weight: 0.5,
    max_layover_minutes: 180,
    avoid_redeye: false,
    home_airport: "SFO",
    preferred_airlines: ["UA"],
    preferred_cabin: "Economy",
    evidence: [],
  };

  const mockFlights: FlightRow[] = [
    {
      flight_id: "F-CHAMP", // Should win due to lower price and preferred airline (UA)
      airline_code: "UA",
      airline_name: "United Airlines",
      alliance: "star",
      flight_numbers: "UA100",
      origin: "SFO",
      origin_city: "San Francisco",
      destination: "LAX",
      destination_city: "Los Angeles",
      departure_utc: "2026-05-23T12:00:00Z",
      arrival_utc: "2026-05-23T13:30:00Z",
      duration_minutes: 90,
      stops: 0,
      layover_airports: "",
      layover_minutes: 0,
      cabin_class: "Economy",
      price: 200,
      currency: "USD",
      seats_available: 5,
      aircraft_type: "737",
      on_time_performance: 90,
      baggage_included: true,
      refundable: false,
      demand_level: "medium",
      season: "shoulder",
      is_holiday_season: false,
    },
    {
      flight_id: "F-CHALL", // Close challenger, slightly higher price and non-preferred airline (AA)
      airline_code: "AA",
      airline_name: "American Airlines",
      alliance: "oneworld",
      flight_numbers: "AA200",
      origin: "SFO",
      origin_city: "San Francisco",
      destination: "LAX",
      destination_city: "Los Angeles",
      departure_utc: "2026-05-23T12:15:00Z",
      arrival_utc: "2026-05-23T13:45:00Z",
      duration_minutes: 90,
      stops: 0,
      layover_airports: "",
      layover_minutes: 0,
      cabin_class: "Economy",
      price: 250,
      currency: "USD",
      seats_available: 5,
      aircraft_type: "737",
      on_time_performance: 90,
      baggage_included: true,
      refundable: false,
      demand_level: "medium",
      season: "shoulder",
      is_holiday_season: false,
    },
  ];

  it("should verify price threshold counterfactuals (closed-form algebra verification) on mock data", () => {
    const opts = { origin: "SFO", destination: "LAX" };
    const { ranked } = filterAndRank(mockFlights, mockPref, opts);
    expect(ranked.length).toBe(2);
    expect(ranked[0].flight_id).toBe("F-CHAMP");

    const cfs = computeCounterfactuals(ranked, mockPref, mockFlights, opts);
    const priceCfs = cfs.filter((cf) => cf.perturbation.kind === "price_drop" && cf.flips);
    
    expect(priceCfs.length).toBeGreaterThan(0);

    for (const cf of priceCfs) {
      const p = cf.perturbation;
      if (p.kind !== "price_drop") continue;

      // Verification test: Set price to $1 under the break-even threshold and re-rank.
      // This MUST flip the winner to this challenger.
      const testPrice = Math.floor(p.toPrice - 1.0);
      
      const reRankOpts = {
        ...opts,
        perturbations: [{ kind: "price_drop" as const, flightId: p.flightId, toPrice: testPrice }],
      };

      const { ranked: newRanked } = filterAndRank(mockFlights, mockPref, reRankOpts);
      expect(newRanked[0].flight_id).toBe(p.flightId);
      expect(newRanked[0].flight_id).not.toBe("F-CHAMP");
    }
  });

  it("should check toggle perturbations and verify they flip the winner correctly on real data", async () => {
    const store = getStore();
    const u01 = store.users.get("U01")!;
    const pref = await inferPreferences(u01);
    const flights = store.flightsByRoute.get("MAA-IST")!;

    const opts = { origin: "MAA", destination: "IST" };
    const { ranked } = filterAndRank(flights, pref, opts);
    const championId = ranked[0].flight_id;

    const cfs = computeCounterfactuals(ranked, pref, flights, opts);
    const toggleCfs = cfs.filter((cf) => cf.perturbation.kind !== "price_drop");

    for (const cf of toggleCfs) {
      if (cf.flips) {
        const newPref = applyPerturbations(pref, [cf.perturbation]);
        const { ranked: newRanked } = filterAndRank(flights, newPref, opts);

        expect(newRanked[0].flight_id).toBe(cf.newWinner.flight_id);
        expect(newRanked[0].flight_id).not.toBe(championId);
      }
    }
  });
});
