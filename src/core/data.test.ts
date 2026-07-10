import { describe, it, expect } from "vitest";
import { getStore, coerceFlightRow, coerceUserRow } from "./data";

describe("Data Layer — Coercion & Indexing", () => {
  it("should coerce flight rows correctly (handling string representation of Python booleans and numbers)", () => {
    const raw = {
      flight_id: "F000001",
      airline_code: "NH",
      airline_name: "ANA",
      alliance: "star",
      flight_numbers: "NH1954",
      origin: "MAA",
      origin_city: "Chennai",
      destination: "IST",
      destination_city: "Istanbul",
      departure_utc: "2026-05-23T16:15:00Z",
      arrival_utc: "2026-05-24T00:15:00Z",
      duration_minutes: "480",
      stops: "0",
      layover_airports: "",
      layover_minutes: "0",
      cabin_class: "Economy",
      price: "764.05",
      currency: "USD",
      seats_available: "3",
      aircraft_type: "A330-300",
      on_time_performance: "93",
      baggage_included: "True",
      refundable: "False",
      demand_level: "medium",
      season: "shoulder",
      is_holiday_season: "False",
    };

    const coerced = coerceFlightRow(raw);
    expect(coerced.flight_id).toBe("F000001");
    expect(coerced.duration_minutes).toBe(480);
    expect(coerced.price).toBe(764.05);
    expect(coerced.baggage_included).toBe(true);
    expect(coerced.refundable).toBe(false);
    expect(coerced.is_holiday_season).toBe(false);
    expect(coerced.stops).toBe(0);
  });

  it("should coerce user rows correctly", () => {
    const raw = {
      user_id: "U01",
      age: "24",
      home_airport: "CPT",
      home_city: "Cape Town",
      frequent_flyer: "AAdvantage",
      preferred_airlines: "AA",
      preferred_cabin: "Business",
      price_sensitivity: "low",
      direct_preference: "strong",
      max_layover_minutes: "120",
      date_flexibility_days: "1",
      multi_city_tendency: "medium",
      trip_purpose: "business",
      preferred_departure: "morning",
      baggage_preference: "carry-on only",
      seasonal_pattern: "year-round, avoids holidays",
      raw_history: "always book business, hate connections | redeyes kill my mornings",
    };

    const coerced = coerceUserRow(raw);
    expect(coerced.user_id).toBe("U01");
    expect(coerced.age).toBe(24);
    expect(coerced.max_layover_minutes).toBe(120);
    expect(coerced.date_flexibility_days).toBe(1);
    expect(coerced.price_sensitivity).toBe("low");
    expect(coerced.direct_preference).toBe("strong");
  });

  it("should index the CSV files successfully in memory on boot", () => {
    const store = getStore();
    expect(store.users.size).toBeGreaterThan(0);
    expect(store.flightsByOrigin.size).toBeGreaterThan(0);
    expect(store.flightsByRoute.size).toBeGreaterThan(0);
    expect(store.airports.size).toBeGreaterThan(0);

    // Verify indexing of routes
    const route = "MAA-IST";
    const flights = store.flightsByRoute.get(route);
    expect(flights).toBeDefined();
    expect(flights!.length).toBeGreaterThan(0);
    
    // Check that every flight in the route index goes from MAA to IST
    flights!.forEach((f) => {
      expect(f.origin).toBe("MAA");
      expect(f.destination).toBe("IST");
    });
  });

  it("should lookup unknown routes cleanly (returning undefined)", () => {
    const store = getStore();
    const flights = store.flightsByRoute.get("XYZ-ABC");
    expect(flights).toBeUndefined();
  });

  it("should perform sub-millisecond route lookups", () => {
    const store = getStore();
    const route = "MAA-IST";
    const start = performance.now();
    const flights = store.flightsByRoute.get(route);
    const end = performance.now();
    const duration = end - start;
    console.log(`[Performance] Lookup for route ${route} took ${duration.toFixed(4)}ms (returned ${flights?.length ?? 0} flights).`);
    expect(duration).toBeLessThan(1.0); // Less than 1ms
  });
});
