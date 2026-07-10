import { FlightRow, UserRow, InferredPreference, ScoredFlight, FilterTrace, Alternative, Perturbation } from "./types";

function normalize(values: number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return values.map(() => 0.5);
  return values.map((v) => (v - lo) / (hi - lo));
}

const SEASON_DEMAND_PENALTY: Record<string, number> = { high: 0.9, medium: 1.0, low: 1.05 };

const CABIN_TIERS: Record<string, number> = {
  "Economy": 1,
  "Premium Economy": 2,
  "Business": 3,
  "First": 4,
};

function diffDays(d1: string, d2: string): number {
  const date1 = new Date(d1.substring(0, 10));
  const date2 = new Date(d2.substring(0, 10));
  const diffTime = Math.abs(date1.getTime() - date2.getTime());
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function getDayName(dateStr: string): string {
  return DAYS[new Date(dateStr).getUTCDay()];
}

export function filterAndRank(
  flights: FlightRow[],
  pref: InferredPreference,
  opts: { origin?: string; destination?: string; date?: string; perturbations?: Perturbation[]; preferredDays?: string[] } = {}
): { ranked: ScoredFlight[]; trace: FilterTrace } {
  const origin = opts.origin ?? pref.home_airport;
  const trace: FilterTrace = { steps: [] };

  // 0. Apply price drop perturbations if any
  let current = flights.map((f) => {
    if (opts.perturbations) {
      const drop = opts.perturbations.find((p) => p.kind === "price_drop" && p.flightId === f.flight_id);
      if (drop && drop.kind === "price_drop") {
        return { ...f, price: drop.toPrice };
      }
    }
    return f;
  });

  const startCount = current.length;

  // 1. Origin constraint
  current = current.filter((f) => f.origin === origin);
  trace.steps.push({
    constraint: `Origin matches ${origin}`,
    removed: startCount - current.length,
    remaining: current.length,
  });

  // 2. Destination constraint
  if (opts.destination) {
    const beforeDest = current.length;
    current = current.filter((f) => f.destination === opts.destination);
    trace.steps.push({
      constraint: `Destination matches ${opts.destination}`,
      removed: beforeDest - current.length,
      remaining: current.length,
    });
  }

  // 3. Layover constraint (nonstop always passes)
  const beforeLayover = current.length;
  current = current.filter((f) => f.stops === 0 || f.layover_minutes <= pref.max_layover_minutes);
  trace.steps.push({
    constraint: `Layover ≤ ${pref.max_layover_minutes}m`,
    removed: beforeLayover - current.length,
    remaining: current.length,
  });

  // 4. Avoid Redeye constraint
  if (pref.avoid_redeye) {
    const beforeRedeye = current.length;
    current = current.filter((f) => {
      // Extract hour from UTC timestamp
      const hour = new Date(f.departure_utc).getUTCHours();
      // Redeye defined as departing between 10 PM and 5 AM
      return !(hour >= 22 || hour < 5);
    });
    trace.steps.push({
      constraint: "Avoid redeye (22:00 - 05:00)",
      removed: beforeRedeye - current.length,
      remaining: current.length,
    });
  }

  // Only apply the date filter when an explicit target date has been requested.
  // Without an explicit date, rank all available dates freely (no date elimination).
  const targetDate = opts.date ?? null;
  if (targetDate && current.length > 0) {
    const flexDays = pref.date_flexibility_days_override ?? pref.date_flexibility_days ?? 14;
    const beforeDate = current.length;
    current = current.filter((f) => {
      const fDate = f.departure_utc.substring(0, 10);
      const diff = diffDays(fDate, targetDate);
      return diff <= flexDays;
    });
    trace.steps.push({
      constraint: `Date flexibility ≤ ${flexDays} days from ${targetDate}`,
      removed: beforeDate - current.length,
      remaining: current.length,
    });
  }

  if (current.length === 0) {
    return { ranked: [], trace };
  }

  const prices = current.map((f) => f.price);
  const durations = current.map((f) => f.duration_minutes);
  const priceScores = normalize(prices).map((v) => 1 - v);
  const timeScores = normalize(durations).map((v) => 1 - v);

  const scored: ScoredFlight[] = current.map((f, i) => {
    const directScore = f.stops === 0 ? 1 : Math.max(0, 1 - 0.35 * f.stops);
    const airlineScore = pref.preferred_airlines.includes(f.airline_code) ? 1 : 0.5;
    const cabinScore = f.cabin_class === pref.preferred_cabin ? 1 : 0.4;
    const demandAdj = SEASON_DEMAND_PENALTY[f.demand_level] ?? 1;
    const holidayAdj = f.is_holiday_season ? 0.95 : 1;

    const priceScore = priceScores[i];
    const timeScore = timeScores[i];

    const costWeight = pref.cost_weight;
    const directWeight = pref.direct_weight;
    const convenienceWeight = pref.convenience_weight;

    const baggageScore = f.baggage_included ? 1 : 0.2;
    const baggageWeight = pref.bags_matter ? 0.25 : 0;

    // Fix 2 — Day-of-week scoring bonus: +0.15 if departure day matches a preferred day.
    // This is a soft nudge (not a hard filter) so all flights remain rankable.
    const flightDayName = getDayName(f.departure_utc).toLowerCase();
    const dayBonus =
      opts.preferredDays && opts.preferredDays.length > 0
        ? opts.preferredDays.some((d) => d.toLowerCase() === flightDayName)
          ? 0.15
          : 0
        : 0;

    const score =
      (costWeight * priceScore +
        directWeight * directScore +
        (1 - costWeight) * 0.5 * timeScore +
        convenienceWeight * 0.3 * cabinScore +
        0.2 * airlineScore +
        baggageWeight * baggageScore) *
      demandAdj *
      holidayAdj +
      dayBonus;

    const breakdown = {
      price: Math.round(costWeight * priceScore * demandAdj * holidayAdj * 1000) / 1000,
      direct: Math.round(directWeight * directScore * demandAdj * holidayAdj * 1000) / 1000,
      time: Math.round((1 - costWeight) * 0.5 * timeScore * demandAdj * holidayAdj * 1000) / 1000,
      cabin: Math.round(convenienceWeight * 0.3 * cabinScore * demandAdj * holidayAdj * 1000) / 1000,
      airline: Math.round(0.2 * airlineScore * demandAdj * holidayAdj * 1000) / 1000,
      baggage: Math.round(baggageWeight * baggageScore * demandAdj * holidayAdj * 1000) / 1000,
      dayBonus: Math.round(dayBonus * 1000) / 1000,
    };

    return {
      ...f,
      score: Math.round(score * 1000) / 1000,
      breakdown,
    };
  });

  const ranked = scored.sort((a, b) => b.score - a.score);
  return { ranked, trace };
}

export function selectAlternatives(
  ranked: ScoredFlight[],
  user: UserRow
): Alternative[] {
  if (ranked.length === 0) return [];

  const champion = ranked[0];
  const championDate = champion.departure_utc.substring(0, 10);
  const alternatives: Alternative[] = [];

  const makeAlt = (
    kind: Alternative["kind"],
    flight: FlightRow | null,
    gain: string,
    cost: string,
    deltaPrice: number,
    deltaMinutes: number
  ): Alternative => ({ kind, flight, gain, cost, deltaPrice, deltaMinutes });

  // 1. Cheapest
  const cheapest = [...ranked].sort((a, b) => a.price - b.price)[0];
  if (cheapest.flight_id === champion.flight_id) {
    alternatives.push(makeAlt("cheapest", cheapest, "You have the cheapest flight", "", 0, 0));
  } else {
    const savings = champion.price - cheapest.price;
    const timeLost = (cheapest.duration_minutes - champion.duration_minutes) / 60;
    alternatives.push(
      makeAlt(
        "cheapest",
        cheapest,
        `save $${Math.round(savings)}`,
        timeLost > 0 ? `+${timeLost.toFixed(1)}h` : timeLost < 0 ? `-${Math.abs(timeLost).toFixed(1)}h` : "same duration",
        -savings,
        cheapest.duration_minutes - champion.duration_minutes
      )
    );
  }

  // 2. Fastest
  const fastest = [...ranked].sort((a, b) => a.duration_minutes - b.duration_minutes)[0];
  if (fastest.flight_id === champion.flight_id) {
    alternatives.push(makeAlt("fastest", fastest, "You have the fastest flight", "", 0, 0));
  } else {
    const timeSaved = (champion.duration_minutes - fastest.duration_minutes) / 60;
    const extraCost = fastest.price - champion.price;
    alternatives.push(
      makeAlt(
        "fastest",
        fastest,
        `arrive ${timeSaved.toFixed(1)}h earlier`,
        extraCost > 0 ? `+$${Math.round(extraCost)}` : `save $${Math.round(Math.abs(extraCost))}`,
        extraCost,
        -(champion.duration_minutes - fastest.duration_minutes)
      )
    );
  }

  // 3. Flexible (Cheapest refundable)
  const refundableOptions = ranked.filter((f) => f.refundable);
  if (refundableOptions.length === 0) {
    alternatives.push(makeAlt("flexible", null, "no refundable options", "", 0, 0));
  } else {
    const cheapestRefundable = [...refundableOptions].sort((a, b) => a.price - b.price)[0];
    if (cheapestRefundable.flight_id === champion.flight_id) {
      alternatives.push(makeAlt("flexible", cheapestRefundable, "refundable (champion)", "", 0, 0));
    } else {
      const extraCost = cheapestRefundable.price - champion.price;
      alternatives.push(
        makeAlt(
          "flexible",
          cheapestRefundable,
          "refundable",
          extraCost > 0 ? `+$${Math.round(extraCost)}` : `save $${Math.round(Math.abs(extraCost))}`,
          extraCost,
          cheapestRefundable.duration_minutes - champion.duration_minutes
        )
      );
    }
  }

  // 4. Comfort (Cheapest cabin upgrade)
  const champCabinTier = CABIN_TIERS[champion.cabin_class] ?? 1;
  const upgradeOptions = ranked.filter((f) => (CABIN_TIERS[f.cabin_class] ?? 1) > champCabinTier);
  if (upgradeOptions.length === 0) {
    alternatives.push(makeAlt("comfort", null, "no cabin upgrade available", "", 0, 0));
  } else {
    const cheapestUpgrade = [...upgradeOptions].sort((a, b) => a.price - b.price)[0];
    const extraCost = cheapestUpgrade.price - champion.price;
    alternatives.push(
      makeAlt(
        "comfort",
        cheapestUpgrade,
        `upgrade to ${cheapestUpgrade.cabin_class}`,
        `+$${Math.round(extraCost)}`,
        extraCost,
        cheapestUpgrade.duration_minutes - champion.duration_minutes
      )
    );
  }

  // 5. Date Shift
  if (user.date_flexibility_days === 0) {
    alternatives.push(makeAlt("date_shift", null, "your dates are fixed", "", 0, 0));
  } else {
    const bestByDate = new Map<string, ScoredFlight>();
    for (const f of ranked) {
      const dStr = f.departure_utc.substring(0, 10);
      if (!bestByDate.has(dStr) || f.score > bestByDate.get(dStr)!.score) {
        bestByDate.set(dStr, f);
      }
    }

    let bestShift: ScoredFlight | null = null;
    let maxSavings = 0;

    for (const [dateStr, flight] of bestByDate.entries()) {
      if (dateStr === championDate) continue;
      const diff = diffDays(dateStr, championDate);
      if (diff <= user.date_flexibility_days) {
        const savings = champion.price - flight.price;
        if (savings > maxSavings || (bestShift === null)) {
          if (savings > maxSavings || (bestShift && flight.score > bestShift.score)) {
            maxSavings = savings;
            bestShift = flight;
          }
        }
      }
    }

    if (bestShift) {
      const shiftDate = bestShift.departure_utc.substring(0, 10);
      const savings = champion.price - bestShift.price;
      alternatives.push(
        makeAlt(
          "date_shift",
          bestShift,
          savings > 0 ? `save $${Math.round(savings)}` : "highest score on alternative date",
          `leave ${getDayName(shiftDate)} instead of ${getDayName(championDate)}`,
          -savings,
          bestShift.duration_minutes - champion.duration_minutes
        )
      );
    } else {
      alternatives.push(makeAlt("date_shift", null, "no alternative dates", "", 0, 0));
    }
  }

  return alternatives;
}
