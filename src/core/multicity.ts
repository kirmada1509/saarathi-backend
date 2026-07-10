import { FlightRow, InferredPreference, ScoredFlight, MultiCityItinerary, MultiCityLeg, Alternative } from "./types";
import { filterAndRank } from "./ranking";
import { getStore } from "./data";

// Generate all permutations of an array
function permute<T>(arr: T[]): T[][] {
  if (arr.length === 0) return [[]];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const subPerms = permute(remaining);
    for (const sub of subPerms) {
      result.push([current, ...sub]);
    }
  }
  return result;
}

// Check if leg2 departs at least 12 hours (720 minutes) after leg1 arrives
function satisfiesTemporalSanity(leg1: FlightRow, leg2: FlightRow): boolean {
  const arrival = new Date(leg1.arrival_utc).getTime();
  const departure = new Date(leg2.departure_utc).getTime();
  const diffMinutes = (departure - arrival) / (1000 * 60);
  return diffMinutes >= 720; // 12 hours turnaround
}

export function optimizeRoute(
  cities: string[],
  pref: InferredPreference
): { itinerary: MultiCityItinerary; alternatives: Alternative[]; counterfactualLabel: string } | null {
  const store = getStore();
  const home = pref.home_airport;

  const permutations = permute(cities);
  const validItineraries: { itinerary: MultiCityItinerary; scoreSum: number; legs: MultiCityLeg[] }[] = [];

  for (const perm of permutations) {
    const route = [home, ...perm, home];
    const legs: MultiCityLeg[] = [];
    let isValid = true;
    let scoreSum = 0;

    for (let i = 0; i < route.length - 1; i++) {
      const from = route[i];
      const to = route[i + 1];
      const flights = store.flightsByRoute.get(`${from}-${to}`) ?? [];

      // Rank flights for this leg using user preferences
      const { ranked } = filterAndRank(flights, pref, { origin: from, destination: to });

      // Find the best flight that satisfies temporal constraints compared to the previous leg
      let selectedFlight: ScoredFlight | null = null;
      for (const f of ranked) {
        if (i === 0) {
          selectedFlight = f;
          break;
        } else {
          const prevFlight = legs[i - 1].flight;
          if (satisfiesTemporalSanity(prevFlight, f)) {
            selectedFlight = f;
            break;
          }
        }
      }

      if (!selectedFlight) {
        isValid = false;
        break;
      }

      legs.push({
        from,
        to,
        flight: selectedFlight,
      });
      scoreSum += selectedFlight.score;
    }

    if (isValid) {
      const totalPrice = legs.reduce((sum, leg) => sum + leg.flight.price, 0);
      const totalDuration = legs.reduce((sum, leg) => sum + leg.flight.duration_minutes, 0);
      
      validItineraries.push({
        itinerary: {
          legs,
          totalPrice,
          totalDurationMinutes: totalDuration,
          cities: perm,
        },
        scoreSum,
        legs,
      });
    }
  }

  if (validItineraries.length === 0) return null;

  // Sort by score sum descending
  validItineraries.sort((a, b) => b.scoreSum - a.scoreSum);
  const champion = validItineraries[0];
  const challenger = validItineraries[1] ?? null;

  // 1. Build Ordering Counterfactual
  let counterfactualLabel = "Nothing else within reason changes this routing decision.";
  if (challenger) {
    // Find a leg in the challenger's path that differs from the champion's path
    // We compute the price drop required on that leg to make the challenger win
    let diffLegIndex = -1;
    for (let i = 0; i < challenger.legs.length; i++) {
      const champLeg = champion.legs[i];
      const challLeg = challenger.legs[i];
      if (champLeg.from !== challLeg.from || champLeg.to !== challLeg.to) {
        diffLegIndex = i;
        break;
      }
    }

    if (diffLegIndex !== -1) {
      const targetLeg = challenger.legs[diffLegIndex];
      const flightsOnTargetRoute = store.flightsByRoute.get(`${targetLeg.from}-${targetLeg.to}`) ?? [];
      const prices = flightsOnTargetRoute.map((f) => f.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;

      if (priceRange > 0 && pref.cost_weight > 0) {
        const scoreGap = champion.scoreSum - challenger.scoreSum;
        const demandAdj = 1.0; // Assume standard scaling for order comparison
        const holidayAdj = 1.0;
        
        // Solve for price drop on this leg
        const priceDrop = (scoreGap) * priceRange / (pref.cost_weight * demandAdj * holidayAdj);
        const targetPrice = targetLeg.flight.price - priceDrop;

        const nextWinnerCities = challenger.itinerary.cities.join(" → ");
        if (priceDrop > 0 && targetPrice > 0 && priceDrop / targetLeg.flight.price <= 0.60) {
          counterfactualLabel = `${nextWinnerCities} wins if the ${targetLeg.from} → ${targetLeg.to} leg price drops below $${Math.floor(targetPrice)}.`;
        }
      }
    }
  }

  // 2. Build Alternatives
  const alternatives: Alternative[] = [];
  const makeAlt = (
    kind: Alternative["kind"],
    flight: FlightRow | null,
    gain: string,
    cost: string,
    deltaPrice: number,
    deltaMinutes: number
  ): Alternative => ({ kind, flight, gain, cost, deltaPrice, deltaMinutes });

  // Cheapest itinerary
  const cheapestItinerary = [...validItineraries].sort((a, b) => a.itinerary.totalPrice - b.itinerary.totalPrice)[0];
  if (cheapestItinerary.itinerary.totalPrice === champion.itinerary.totalPrice) {
    alternatives.push(makeAlt("cheapest", champion.legs[0].flight, "You have the cheapest routing order", "", 0, 0));
  } else {
    const savings = champion.itinerary.totalPrice - cheapestItinerary.itinerary.totalPrice;
    const timeLost = (cheapestItinerary.itinerary.totalDurationMinutes - champion.itinerary.totalDurationMinutes) / 60;
    const citiesOrder = cheapestItinerary.itinerary.cities.join(" → ");
    alternatives.push(
      makeAlt(
        "cheapest",
        cheapestItinerary.legs[0].flight,
        `save $${Math.round(savings)} (order: ${citiesOrder})`,
        timeLost > 0 ? `+${timeLost.toFixed(1)}h` : `save ${Math.abs(timeLost).toFixed(1)}h travel time`,
        -savings,
        cheapestItinerary.itinerary.totalDurationMinutes - champion.itinerary.totalDurationMinutes
      )
    );
  }

  // Fastest itinerary
  const fastestItinerary = [...validItineraries].sort((a, b) => a.itinerary.totalDurationMinutes - b.itinerary.totalDurationMinutes)[0];
  if (fastestItinerary.itinerary.totalDurationMinutes === champion.itinerary.totalDurationMinutes) {
    alternatives.push(makeAlt("fastest", champion.legs[0].flight, "You have the fastest routing order", "", 0, 0));
  } else {
    const timeSaved = (champion.itinerary.totalDurationMinutes - fastestItinerary.itinerary.totalDurationMinutes) / 60;
    const extraCost = fastestItinerary.itinerary.totalPrice - champion.itinerary.totalPrice;
    const citiesOrder = fastestItinerary.itinerary.cities.join(" → ");
    alternatives.push(
      makeAlt(
        "fastest",
        fastestItinerary.legs[0].flight,
        `save ${timeSaved.toFixed(1)}h travel time (order: ${citiesOrder})`,
        extraCost > 0 ? `+$${Math.round(extraCost)}` : `save $${Math.round(Math.abs(extraCost))}`,
        extraCost,
        -(champion.itinerary.totalDurationMinutes - fastestItinerary.itinerary.totalDurationMinutes)
      )
    );
  }

  // Set placeholders for flexible, comfort, and date_shift since they are single-leg features
  // but they still need to render empty states or stubs
  alternatives.push(makeAlt("flexible", null, "use single-leg mode for date flexibility", "", 0, 0));
  alternatives.push(makeAlt("comfort", null, "use single-leg mode for cabin class checks", "", 0, 0));
  alternatives.push(makeAlt("date_shift", null, "use single-leg mode for date shift alternatives", "", 0, 0));

  return {
    itinerary: champion.itinerary,
    alternatives,
    counterfactualLabel,
  };
}
