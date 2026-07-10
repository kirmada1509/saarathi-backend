"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const data_1 = require("../core/data");
const preferences_1 = require("../core/preferences");
const ranking_1 = require("../core/ranking");
const counterfactuals_1 = require("../core/counterfactuals");
const confidence_1 = require("../core/confidence");
const explain_1 = require("../core/explain");
const multicity_1 = require("../core/multicity");
const PerturbationSchema = zod_1.z.union([
    zod_1.z.object({ kind: zod_1.z.literal("price_drop"), flightId: zod_1.z.string(), toPrice: zod_1.z.number() }),
    zod_1.z.object({ kind: zod_1.z.literal("accept_one_stop") }),
    zod_1.z.object({ kind: zod_1.z.literal("bags_matter") }),
    zod_1.z.object({ kind: zod_1.z.literal("evening_ok") }),
    zod_1.z.object({ kind: zod_1.z.literal("ignore_loyalty") }),
    zod_1.z.object({ kind: zod_1.z.literal("shift_dates"), days: zod_1.z.number() }),
]);
const RecommendRequestSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    requestText: zod_1.z.string(),
    origin: zod_1.z.string().optional(),
    destination: zod_1.z.string().optional(),
    cities: zod_1.z.array(zod_1.z.string()).optional(),
    perturbations: zod_1.z.array(PerturbationSchema).optional(),
});
function extractPreferredDays(requestText) {
    const matches = requestText.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi);
    if (!matches)
        return [];
    return [...new Set(matches.map((d) => d.toLowerCase()))];
}
function findBindingConstraint(steps) {
    if (steps.length === 0)
        return null;
    return steps.reduce((max, step) => (step.removed > max.removed ? step : max), steps[0]);
}
let RecommendController = class RecommendController {
    async getRecommendation(body) {
        const parsed = RecommendRequestSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException({
                error: "Invalid request body",
                details: parsed.error.format(),
            });
        }
        const { userId, requestText, perturbations = [] } = parsed.data;
        const store = (0, data_1.getStore)();
        const user = store.users.get(userId);
        if (!user) {
            throw new common_1.NotFoundException({ error: `User with ID ${userId} not found.` });
        }
        const basePref = await (0, preferences_1.inferPreferences)(user);
        const perturbedPref = (0, counterfactuals_1.applyPerturbations)(basePref, perturbations);
        const preferredDays = extractPreferredDays(requestText);
        if (parsed.data.cities && parsed.data.cities.length > 0) {
            const cities = parsed.data.cities;
            const mcResult = (0, multicity_1.optimizeRoute)(cities, perturbedPref);
            if (!mcResult) {
                throw new common_1.NotFoundException({
                    error: "No valid multi-city routes found. Please check date constraints and connection limits."
                });
            }
            const { itinerary, alternatives, counterfactualLabel, scoreGap } = mcResult;
            const verdict = itinerary.legs[0].flight;
            const championScore = verdict.score;
            const challengerScore = Math.max(0, championScore - scoreGap);
            const syntheticRanked = [
                { ...verdict, score: championScore },
                { ...verdict, score: challengerScore },
            ];
            const ranked = itinerary.legs.map((l) => l.flight);
            const counterfactuals = [
                {
                    perturbation: { kind: "accept_one_stop" },
                    label: counterfactualLabel,
                    newWinner: verdict,
                    flips: counterfactualLabel !== "Nothing else within reason changes this routing decision.",
                },
            ];
            const confidence = (0, confidence_1.computeConfidence)(syntheticRanked, perturbedPref);
            const explanation = await (0, explain_1.explain)(userId, requestText, perturbedPref, [verdict], alternatives, counterfactuals, confidence);
            const trace = [
                { id: "request", label: "Query Parse", payload: { userId, requestText, cities, perturbations } },
                { id: "preferences", label: "Preferences Evidence", payload: perturbedPref.evidence },
                { id: "constraints", label: "Itinerary Turnaround", payload: itinerary.legs.map(l => ({ from: l.from, to: l.to, flight_id: l.flight.flight_id })) },
                { id: "candidates", label: "Optimal Routing Order", payload: itinerary.cities },
                { id: "tradeoffs", label: "Itinerary Opportunity Cost", payload: alternatives },
                { id: "counterfactuals", label: "Route Order Counterfactuals", payload: counterfactuals },
                { id: "verdict", label: "Verdict Summary", payload: itinerary },
            ];
            return {
                mode: "multi-city",
                verdict,
                ranked,
                preference: perturbedPref,
                alternatives,
                counterfactuals,
                confidence,
                trace,
                explanation,
                itinerary,
                appliedPerturbations: perturbations,
            };
        }
        else {
            let destination = parsed.data.destination;
            if (!destination && requestText) {
                const uppercaseMatch = requestText.match(/\b([A-Z]{3})\b/);
                if (uppercaseMatch) {
                    destination = uppercaseMatch[1];
                }
                else {
                    for (const [code, info] of store.airports.entries()) {
                        if (requestText.toLowerCase().includes(info.city.toLowerCase()) ||
                            requestText.toLowerCase().includes(code.toLowerCase())) {
                            destination = code;
                            break;
                        }
                    }
                }
            }
            if (!destination) {
                throw new common_1.BadRequestException({
                    error: "Could not resolve destination. Please select a destination airport."
                });
            }
            const origin = parsed.data.origin ?? user.home_airport;
            const routeFlights = store.flightsByRoute.get(`${origin}-${destination}`) ?? [];
            const opts = { origin, destination, perturbations, preferredDays };
            const { ranked, trace: filterTrace } = (0, ranking_1.filterAndRank)(routeFlights, perturbedPref, opts);
            if (ranked.length === 0) {
                const bindingStep = findBindingConstraint(filterTrace.steps);
                let relaxedVerdict = null;
                let relaxedExplanation = "";
                let relaxedNote = "";
                if (bindingStep) {
                    if (bindingStep.constraint.toLowerCase().includes("layover")) {
                        const originalLayover = perturbedPref.max_layover_minutes;
                        const relaxedLayover = Math.round(originalLayover * 1.5);
                        const relaxedPref = { ...perturbedPref, max_layover_minutes: relaxedLayover };
                        const relaxedOpts = { origin, destination, perturbations, preferredDays };
                        const { ranked: relaxedRanked } = (0, ranking_1.filterAndRank)(routeFlights, relaxedPref, relaxedOpts);
                        if (relaxedRanked.length > 0) {
                            relaxedVerdict = relaxedRanked[0];
                            relaxedNote = ` [Relaxed: layover <= ${relaxedLayover}m]`;
                            relaxedExplanation =
                                `No flights matched. The binding constraint was "${bindingStep.constraint}" which eliminated ${bindingStep.removed} flight(s). ` +
                                    `If you allow up to ${relaxedLayover} minutes layover, ${relaxedRanked.length} flight(s) open up. ` +
                                    `Best option under relaxed constraints: ${relaxedVerdict.airline_name} ${relaxedVerdict.flight_numbers} at $${relaxedVerdict.price}.`;
                        }
                        else {
                            if (perturbedPref.avoid_redeye) {
                                const relaxedPref2 = { ...relaxedPref, avoid_redeye: false };
                                const { ranked: relaxedRanked2 } = (0, ranking_1.filterAndRank)(routeFlights, relaxedPref2, relaxedOpts);
                                if (relaxedRanked2.length > 0) {
                                    relaxedVerdict = relaxedRanked2[0];
                                    relaxedNote = ` [Relaxed: layover <= ${relaxedLayover}m + redeye ok]`;
                                    relaxedExplanation =
                                        `No flights matched. The binding constraint was "${bindingStep.constraint}" which eliminated ${bindingStep.removed} flight(s). ` +
                                            `Relaxing to ${relaxedLayover}m layover and allowing redeye flights opens up ${relaxedRanked2.length} option(s). ` +
                                            `Best option under relaxed constraints: ${relaxedVerdict.airline_name} ${relaxedVerdict.flight_numbers} at $${relaxedVerdict.price}.`;
                                }
                            }
                        }
                    }
                    else if (bindingStep.constraint.toLowerCase().includes("redeye") && perturbedPref.avoid_redeye) {
                        const relaxedPref = { ...perturbedPref, avoid_redeye: false };
                        const relaxedOpts = { origin, destination, perturbations, preferredDays };
                        const { ranked: relaxedRanked } = (0, ranking_1.filterAndRank)(routeFlights, relaxedPref, relaxedOpts);
                        if (relaxedRanked.length > 0) {
                            relaxedVerdict = relaxedRanked[0];
                            relaxedNote = " [Relaxed: redeye ok]";
                            relaxedExplanation =
                                `No flights matched. The binding constraint was "${bindingStep.constraint}" which eliminated ${bindingStep.removed} flight(s). ` +
                                    `If you allow redeye departures, ${relaxedRanked.length} flight(s) open up. ` +
                                    `Best option: ${relaxedVerdict.airline_name} ${relaxedVerdict.flight_numbers} at $${relaxedVerdict.price}.`;
                        }
                    }
                }
                const staticFallback = `No flights matched your hard constraints (layovers, dates, redeyes). ` +
                    (bindingStep
                        ? `The binding constraint was "${bindingStep.constraint}" which eliminated ${bindingStep.removed} flight(s). `
                        : "") +
                    `Review the decision boundaries below to see what changes would produce recommendations.`;
                const relaxedList = relaxedVerdict ? [relaxedVerdict] : [];
                const alternatives = (0, ranking_1.selectAlternatives)(relaxedVerdict ? [relaxedVerdict] : [], user);
                const counterfactuals = (0, counterfactuals_1.computeCounterfactuals)(relaxedVerdict ? [relaxedVerdict] : [], perturbedPref, routeFlights, opts);
                const confidence = (0, confidence_1.computeConfidence)(relaxedVerdict ? [relaxedVerdict] : [], perturbedPref);
                const contextText = relaxedExplanation || staticFallback;
                const finalExplanation = relaxedVerdict
                    ? await (0, explain_1.explain)(userId, requestText, perturbedPref, relaxedList, alternatives, counterfactuals, confidence)
                    : staticFallback;
                const trace = [
                    { id: "request", label: "Query Parse", payload: { userId, requestText, destination, perturbations } },
                    { id: "preferences", label: "Preferences Evidence", payload: perturbedPref.evidence },
                    { id: "constraints", label: "Hard Constraints Applied", payload: filterTrace.steps },
                    { id: "candidates", label: "Scored Candidates", payload: relaxedList.map(r => ({ id: r.flight_id, score: r.score, note: relaxedNote })) },
                    { id: "tradeoffs", label: "Opportunity Cost", payload: alternatives },
                    { id: "counterfactuals", label: "Decision Boundary Advice", payload: counterfactuals },
                    { id: "verdict", label: "Verdict Summary", payload: relaxedVerdict },
                ];
                return {
                    mode: "single-leg",
                    verdict: relaxedVerdict,
                    ranked: relaxedList,
                    preference: perturbedPref,
                    alternatives,
                    counterfactuals,
                    confidence,
                    trace,
                    explanation: (relaxedNote ? `[${relaxedNote.trim()}] ` : "") + finalExplanation,
                    appliedPerturbations: perturbations,
                };
            }
            const verdict = ranked[0];
            const alternatives = (0, ranking_1.selectAlternatives)(ranked, user);
            const counterfactuals = (0, counterfactuals_1.computeCounterfactuals)(ranked, basePref, routeFlights, opts);
            const confidence = (0, confidence_1.computeConfidence)(ranked, perturbedPref);
            const explanation = await (0, explain_1.explain)(userId, requestText, perturbedPref, ranked, alternatives, counterfactuals, confidence);
            const trace = [
                { id: "request", label: "Query Parse", payload: { userId, requestText, destination, perturbations } },
                { id: "preferences", label: "Preferences Evidence", payload: perturbedPref.evidence },
                { id: "constraints", label: "Hard Constraints Applied", payload: filterTrace.steps },
                { id: "candidates", label: "Scored Candidates", payload: ranked.map(r => ({ id: r.flight_id, score: r.score, breakdown: r.breakdown })) },
                { id: "tradeoffs", label: "Opportunity Cost", payload: alternatives },
                { id: "counterfactuals", label: "Decision Boundaries", payload: counterfactuals },
                { id: "verdict", label: "Verdict Summary", payload: verdict },
            ];
            return {
                mode: "single-leg",
                verdict,
                ranked,
                preference: perturbedPref,
                alternatives,
                counterfactuals,
                confidence,
                trace,
                explanation,
                appliedPerturbations: perturbations,
            };
        }
    }
};
exports.RecommendController = RecommendController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RecommendController.prototype, "getRecommendation", null);
exports.RecommendController = RecommendController = __decorate([
    (0, common_1.Controller)('api/recommend')
], RecommendController);
//# sourceMappingURL=recommend.controller.js.map