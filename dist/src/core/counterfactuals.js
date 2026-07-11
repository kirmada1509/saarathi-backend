"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPerturbations = applyPerturbations;
exports.computeCounterfactuals = computeCounterfactuals;
const ranking_1 = require("./ranking");
const data_1 = require("./data");
const SEASON_DEMAND_PENALTY = {
    high: 0.9,
    medium: 1.0,
    low: 1.05,
};
function applyPerturbations(pref, ps) {
    const copy = {
        ...pref,
        preferred_airlines: [...pref.preferred_airlines],
        evidence: [...pref.evidence],
    };
    for (const p of ps) {
        if (p.kind === 'accept_one_stop') {
            copy.direct_weight = 0.15;
            copy.max_layover_minutes = Math.max(copy.max_layover_minutes, 420);
        }
        else if (p.kind === 'bags_matter') {
            copy.bags_matter = true;
        }
        else if (p.kind === 'evening_ok') {
            copy.avoid_redeye = false;
        }
        else if (p.kind === 'ignore_loyalty') {
            copy.preferred_airlines = [];
        }
        else if (p.kind === 'shift_dates') {
            copy.date_flexibility_days_override = p.days;
        }
    }
    return copy;
}
function computeCounterfactuals(ranked, pref, candidates, opts = {}) {
    const champion = ranked.length > 0 ? ranked[0] : null;
    const counterfactuals = [];
    const prices = ranked.map((f) => f.price);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const priceRange = maxPrice - minPrice;
    if (champion) {
        const challengers = ranked.slice(1, 4);
        for (const c of challengers) {
            if (pref.cost_weight === 0 || priceRange === 0) {
                counterfactuals.push({
                    perturbation: {
                        kind: 'price_drop',
                        flightId: c.flight_id,
                        toPrice: 0,
                    },
                    label: `${c.airline_name} ${c.flight_numbers} cannot win through price (cost sensitivity is zero)`,
                    newWinner: c,
                    flips: false,
                });
                continue;
            }
            const demandAdj = SEASON_DEMAND_PENALTY[c.demand_level] ?? 1;
            const holidayAdj = c.is_holiday_season ? 0.95 : 1;
            const priceDrop = ((champion.score - c.score) * priceRange) /
                (pref.cost_weight * demandAdj * holidayAdj);
            const targetPrice = Math.round((c.price - priceDrop) * 100) / 100;
            const dropPct = priceDrop / c.price;
            if (dropPct > 0.6 || targetPrice <= 0) {
                counterfactuals.push({
                    perturbation: {
                        kind: 'price_drop',
                        flightId: c.flight_id,
                        toPrice: targetPrice,
                    },
                    label: `${c.airline_name} ${c.flight_numbers} wins if price drops, but no realistic price makes this win`,
                    newWinner: { ...c, price: targetPrice },
                    flips: false,
                });
            }
            else {
                counterfactuals.push({
                    perturbation: {
                        kind: 'price_drop',
                        flightId: c.flight_id,
                        toPrice: targetPrice,
                    },
                    label: `${c.airline_name} ${c.flight_numbers} becomes my pick if its fare drops below $${Math.floor(targetPrice)}`,
                    newWinner: { ...c, price: targetPrice, score: champion.score },
                    flips: true,
                });
            }
        }
    }
    const toggles = [
        { kind: 'accept_one_stop' },
        { kind: 'bags_matter' },
        { kind: 'evening_ok' },
        { kind: 'ignore_loyalty' },
    ];
    try {
        const store = (0, data_1.getStore)();
        const user = store.users.get(pref.user_id);
        if (user && user.date_flexibility_days > 0) {
            toggles.push({ kind: 'shift_dates', days: user.date_flexibility_days });
        }
    }
    catch {
    }
    for (const t of toggles) {
        const perturbedPref = applyPerturbations(pref, [t]);
        const { ranked: newRanked } = (0, ranking_1.filterAndRank)(candidates, perturbedPref, opts);
        if (newRanked.length > 0) {
            const newWinner = newRanked[0];
            const flips = champion
                ? newWinner.flight_id !== champion.flight_id
                : true;
            let label = '';
            if (t.kind === 'accept_one_stop') {
                label = `${newWinner.airline_name} ${newWinner.flight_numbers} wins if you accept one stop`;
            }
            else if (t.kind === 'bags_matter') {
                label = `${newWinner.airline_name} ${newWinner.flight_numbers} wins if baggage inclusion matters more`;
            }
            else if (t.kind === 'evening_ok') {
                label = `${newWinner.airline_name} ${newWinner.flight_numbers} wins if evening departure is OK`;
            }
            else if (t.kind === 'ignore_loyalty') {
                label = `${newWinner.airline_name} ${newWinner.flight_numbers} wins if loyalty preferences are ignored`;
            }
            else if (t.kind === 'shift_dates') {
                label = `${newWinner.airline_name} ${newWinner.flight_numbers} wins if you shift dates ±${t.days} days`;
            }
            counterfactuals.push({
                perturbation: t,
                label,
                newWinner,
                flips,
            });
        }
    }
    return counterfactuals;
}
//# sourceMappingURL=counterfactuals.js.map