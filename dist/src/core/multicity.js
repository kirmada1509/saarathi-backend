"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optimizeRoute = optimizeRoute;
const ranking_1 = require("./ranking");
const data_1 = require("./data");
function permute(arr) {
    if (arr.length === 0)
        return [[]];
    const result = [];
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
function satisfiesTemporalSanity(leg1, leg2) {
    const arrival = new Date(leg1.arrival_utc).getTime();
    const departure = new Date(leg2.departure_utc).getTime();
    const diffMinutes = (departure - arrival) / (1000 * 60);
    return diffMinutes >= 60;
}
function optimizeRoute(cities, pref) {
    const store = (0, data_1.getStore)();
    const home = pref.home_airport;
    const permutations = permute(cities);
    const validItineraries = [];
    for (const perm of permutations) {
        const route = [home, ...perm, home];
        const rankedLegs = [];
        for (let i = 0; i < route.length - 1; i++) {
            const from = route[i];
            const to = route[i + 1];
            const flights = store.flightsByRoute.get(`${from}-${to}`) ?? [];
            const { ranked } = (0, ranking_1.filterAndRank)(flights, pref, {
                origin: from,
                destination: to,
            });
            rankedLegs.push(ranked);
        }
        const maxRemainingScore = new Array(route.length - 1).fill(0);
        let sum = 0;
        for (let i = route.length - 2; i >= 0; i--) {
            maxRemainingScore[i] = sum;
            if (rankedLegs[i + 1] && rankedLegs[i + 1].length > 0) {
                sum += rankedLegs[i + 1][0].score;
            }
        }
        let bestPathResult = null;
        function search(legIdx, prevFlight) {
            if (legIdx === route.length - 1) {
                return { legs: [], scoreSum: 0 };
            }
            const from = route[legIdx];
            const to = route[legIdx + 1];
            const ranked = rankedLegs[legIdx];
            let bestSubResult = null;
            for (const f of ranked) {
                if (prevFlight && !satisfiesTemporalSanity(prevFlight, f)) {
                    continue;
                }
                if (bestPathResult &&
                    f.score + maxRemainingScore[legIdx] <= bestPathResult.scoreSum) {
                    break;
                }
                const sub = search(legIdx + 1, f);
                if (sub) {
                    const currentScoreSum = f.score + sub.scoreSum;
                    if (!bestSubResult || currentScoreSum > bestSubResult.scoreSum) {
                        bestSubResult = {
                            legs: [{ from, to, flight: f }, ...sub.legs],
                            scoreSum: currentScoreSum,
                        };
                        if (legIdx === 0) {
                            bestPathResult = bestSubResult;
                        }
                    }
                }
            }
            return bestSubResult;
        }
        const searchResult = search(0, null);
        if (searchResult) {
            const { legs, scoreSum } = searchResult;
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
    if (validItineraries.length === 0)
        return null;
    validItineraries.sort((a, b) => b.scoreSum - a.scoreSum);
    const champion = validItineraries[0];
    const challenger = validItineraries[1] ?? null;
    let counterfactualLabel = 'Nothing else within reason changes this routing decision.';
    if (challenger) {
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
                const demandAdj = 1.0;
                const holidayAdj = 1.0;
                const priceDrop = (scoreGap * priceRange) / (pref.cost_weight * demandAdj * holidayAdj);
                const targetPrice = targetLeg.flight.price - priceDrop;
                const nextWinnerCities = challenger.itinerary.cities.join(' → ');
                if (priceDrop > 0 &&
                    targetPrice > 0 &&
                    priceDrop / targetLeg.flight.price <= 0.6) {
                    counterfactualLabel = `${nextWinnerCities} wins if the ${targetLeg.from} → ${targetLeg.to} leg price drops below $${Math.floor(targetPrice)}.`;
                }
            }
        }
    }
    const alternatives = [];
    const makeAlt = (kind, flight, gain, cost, deltaPrice, deltaMinutes) => ({ kind, flight, gain, cost, deltaPrice, deltaMinutes });
    const cheapestItinerary = [...validItineraries].sort((a, b) => a.itinerary.totalPrice - b.itinerary.totalPrice)[0];
    if (cheapestItinerary.itinerary.totalPrice === champion.itinerary.totalPrice) {
        alternatives.push(makeAlt('cheapest', champion.legs[0].flight, 'You have the cheapest routing order', '', 0, 0));
    }
    else {
        const savings = champion.itinerary.totalPrice - cheapestItinerary.itinerary.totalPrice;
        const timeLost = (cheapestItinerary.itinerary.totalDurationMinutes -
            champion.itinerary.totalDurationMinutes) /
            60;
        const citiesOrder = cheapestItinerary.itinerary.cities.join(' → ');
        alternatives.push(makeAlt('cheapest', cheapestItinerary.legs[0].flight, `save $${Math.round(savings)} (order: ${citiesOrder})`, timeLost > 0
            ? `+${timeLost.toFixed(1)}h`
            : `save ${Math.abs(timeLost).toFixed(1)}h travel time`, -savings, cheapestItinerary.itinerary.totalDurationMinutes -
            champion.itinerary.totalDurationMinutes));
    }
    const fastestItinerary = [...validItineraries].sort((a, b) => a.itinerary.totalDurationMinutes - b.itinerary.totalDurationMinutes)[0];
    if (fastestItinerary.itinerary.totalDurationMinutes ===
        champion.itinerary.totalDurationMinutes) {
        alternatives.push(makeAlt('fastest', champion.legs[0].flight, 'You have the fastest routing order', '', 0, 0));
    }
    else {
        const timeSaved = (champion.itinerary.totalDurationMinutes -
            fastestItinerary.itinerary.totalDurationMinutes) /
            60;
        const extraCost = fastestItinerary.itinerary.totalPrice - champion.itinerary.totalPrice;
        const citiesOrder = fastestItinerary.itinerary.cities.join(' → ');
        alternatives.push(makeAlt('fastest', fastestItinerary.legs[0].flight, `save ${timeSaved.toFixed(1)}h travel time (order: ${citiesOrder})`, extraCost > 0
            ? `+$${Math.round(extraCost)}`
            : `save $${Math.round(Math.abs(extraCost))}`, extraCost, -(champion.itinerary.totalDurationMinutes -
            fastestItinerary.itinerary.totalDurationMinutes)));
    }
    alternatives.push(makeAlt('flexible', null, 'use single-leg mode for date flexibility', '', 0, 0));
    alternatives.push(makeAlt('comfort', null, 'use single-leg mode for cabin class checks', '', 0, 0));
    alternatives.push(makeAlt('date_shift', null, 'use single-leg mode for date shift alternatives', '', 0, 0));
    return {
        itinerary: champion.itinerary,
        alternatives,
        counterfactualLabel,
        scoreGap: champion.scoreSum - (challenger?.scoreSum ?? champion.scoreSum - 0.2),
    };
}
//# sourceMappingURL=multicity.js.map