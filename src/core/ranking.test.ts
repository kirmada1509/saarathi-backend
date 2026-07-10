import { describe, it, expect } from "vitest";
import { getStore } from "./data";
import { inferPreferences } from "./preferences";
import { filterAndRank, selectAlternatives } from "./ranking";

describe("Ranking & Selection Module", () => {
  it("should rank flights, trace filters, and compute score breakdowns", async () => {
    const store = getStore();
    const u01 = store.users.get("U01")!;
    const pref = await inferPreferences(u01);

    // Let's get flights for route MAA-IST
    const flights = store.flightsByRoute.get("MAA-IST")!;
    expect(flights).toBeDefined();

    const { ranked, trace } = filterAndRank(flights, pref, { origin: "MAA", destination: "IST" });
    expect(ranked.length).toBeGreaterThan(0);
    expect(trace.steps.length).toBeGreaterThan(0);

    // Assert that the first ranked flight has the highest score
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);

    // Verify score breakdown
    const breakdown = ranked[0].breakdown;
    expect(breakdown).toBeDefined();
    expect(breakdown?.price).toBeDefined();
    expect(breakdown?.direct).toBeDefined();
    expect(breakdown?.time).toBeDefined();
    expect(breakdown?.cabin).toBeDefined();
    expect(breakdown?.airline).toBeDefined();

    // Verify trace steps
    expect(trace.steps.some((step) => step.constraint.includes("Layover"))).toBe(true);
  });

  it("should select the five kinds of alternatives correctly", async () => {
    const store = getStore();
    const u01 = store.users.get("U01")!;
    const pref = await inferPreferences(u01);
    const flights = store.flightsByRoute.get("MAA-IST")!;

    const { ranked } = filterAndRank(flights, pref, { origin: "MAA", destination: "IST" });
    const alternatives = selectAlternatives(ranked, u01);

    expect(alternatives.length).toBe(5);

    const kinds = alternatives.map((alt) => alt.kind);
    expect(kinds).toContain("cheapest");
    expect(kinds).toContain("fastest");
    expect(kinds).toContain("flexible");
    expect(kinds).toContain("comfort");
    expect(kinds).toContain("date_shift");

    // Cheapest alternative checks
    const cheapestAlt = alternatives.find((alt) => alt.kind === "cheapest")!;
    expect(cheapestAlt.flight).not.toBeNull();
    
    // Comfort (cabin upgrade) alternative checks
    const comfortAlt = alternatives.find((alt) => alt.kind === "comfort")!;
    // Since U01 is structured: preferred cabin is Business, a cabin upgrade might be null (no upgrade above Business or First)
    // We expect it to handle the empty state gracefully without crashing
    if (comfortAlt.flight === null) {
      expect(comfortAlt.gain).toBe("no cabin upgrade available");
    } else {
      expect(comfortAlt.gain).toContain("upgrade to");
    }
  });
});
