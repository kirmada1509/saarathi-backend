# Saarathi — Benchmark Evaluation Report

**Date:** 2026-07-10T21:34:06.815Z
**API:** http://localhost:4000

## Summary

| ✅ PASS | ⚠ PARTIAL | ❌ FAIL | Total |
|--------|----------|--------|-------|
| 6 | 0 | 0 | 6 |

## Results by Scenario

### ✅ B01 — User U01 → NRT

| Field | Value |
|---|---|
| **Mode** | `single-leg` |
| **Winner** | American Airlines AA351 (CPT→NRT) |
| **Total Price** | $1571.95 |
| **Confidence** | medium (88%) |
| **Status** | **PASS** |

**Constraint Trace:**
- `Origin matches CPT — removed 0, remaining 57`
- `Destination matches NRT — removed 0, remaining 57`
- `Layover ≤ 120m — removed 19, remaining 38`
- `Avoid redeye (22:00 - 05:00) — removed 6, remaining 32`

**Inferred Preferences:**
```json
{
  "direct_weight": 1,
  "cost_weight": 0.2,
  "convenience_weight": 0.88,
  "avoid_redeye": true,
  "preferred_airlines": [
    "AA"
  ],
  "preferred_cabin": "Business",
  "evidenceCount": 6
}
```

**LLM Rationale Preview:**
> The #1 ranked flight, American Airlines AA351, is the best match for this traveler due to their strong preference for direct flights (direct_weight=0.9) and preferred airline (AA). They are making a t

---

### ✅ B02 — User U02 → LHR+CDG+FCO

| Field | Value |
|---|---|
| **Mode** | `multi-city` |
| **Winner** | MEX→CDG (Singapore Airlines), CDG→LHR (British Airways), LHR→FCO (Singapore Airlines), FCO→MEX (American Airlines) |
| **Total Price** | $2202 |
| **Confidence** | high (95%) |
| **Status** | **PASS** |

**Constraint Trace:**
- `Leg: MEX→CDG`
- `Leg: CDG→LHR`
- `Leg: LHR→FCO`
- `Leg: FCO→MEX`

**Inferred Preferences:**
```json
{
  "direct_weight": 0.15,
  "cost_weight": 1,
  "convenience_weight": 0.4,
  "avoid_redeye": false,
  "preferred_airlines": [
    "SQ",
    "BA"
  ],
  "preferred_cabin": "Economy",
  "evidenceCount": 8
}
```

**LLM Rationale Preview:**
> The #1 ranked flight, Singapore Airlines SQ3983, is the best match for this traveler due to their high price sensitivity, as evidenced by their raw history and structured data (price_sensitivity=high,

---

### ✅ B03 — User U03 → DPS

| Field | Value |
|---|---|
| **Mode** | `single-leg` |
| **Winner** | Cathay Pacific CX808 (AMS→DPS) |
| **Total Price** | $1122.02 |
| **Confidence** | medium (94%) |
| **Status** | **PASS** |

**Constraint Trace:**
- `Origin matches AMS — removed 0, remaining 39`
- `Destination matches DPS — removed 0, remaining 39`
- `Layover ≤ 150m — removed 21, remaining 18`
- `Avoid redeye (22:00 - 05:00) — removed 5, remaining 13`

**Inferred Preferences:**
```json
{
  "direct_weight": 1,
  "cost_weight": 0.5,
  "convenience_weight": 0.7,
  "avoid_redeye": true,
  "preferred_airlines": [
    "KL",
    "JL",
    "CX"
  ],
  "preferred_cabin": "Economy",
  "evidenceCount": 6
}
```

**LLM Rationale Preview:**
> The #1 ranked flight, Cathay Pacific CX808, is the best match for this traveler due to its direct flight, which aligns with their strong direct preference (direct_weight=0.9) and previous statement th

---

### ✅ B04 — User U04 → JFK

| Field | Value |
|---|---|
| **Mode** | `single-leg` |
| **Winner** | Air India AI5508 (MEL→JFK) |
| **Total Price** | $1529.49 |
| **Confidence** | medium (100%) |
| **Status** | **PASS** |

**Constraint Trace:**
- `Origin matches MEL — removed 0, remaining 46`
- `Destination matches JFK — removed 0, remaining 46`
- `Layover ≤ 300m — removed 3, remaining 43`

**Inferred Preferences:**
```json
{
  "direct_weight": 0.55,
  "cost_weight": 0.85,
  "convenience_weight": 0.64,
  "avoid_redeye": false,
  "preferred_airlines": [
    "JL"
  ],
  "preferred_cabin": "Economy",
  "evidenceCount": 5
}
```

**LLM Rationale Preview:**
> The #1 ranked flight, Air India AI5508, is the best match for this traveler due to its moderate directness (direct_weight=0.55) and high price sensitivity (cost_weight=0.85), as it offers a non-stop f

---

### ✅ B05 — User U05 → SYD

| Field | Value |
|---|---|
| **Mode** | `single-leg` |
| **Winner** | ANA NH9376;NH796 (LIS→SYD) |
| **Total Price** | $1439.76 |
| **Confidence** | high (66%) |
| **Status** | **PASS** |

**Constraint Trace:**
- `Origin matches LIS — removed 0, remaining 9`
- `Destination matches SYD — removed 0, remaining 9`
- `Layover ≤ 90m — removed 9, remaining 0`

**Inferred Preferences:**
```json
{
  "direct_weight": 1,
  "cost_weight": 0.05,
  "convenience_weight": 1,
  "avoid_redeye": false,
  "preferred_airlines": [
    "LH"
  ],
  "preferred_cabin": "First",
  "evidenceCount": 8
}
```

**LLM Rationale Preview:**
> [[Relaxed: layover <= 135m]] The #1 ranked flight, ANA NH9376;NH796, is the best match for this traveler due to their strong preference for direct flights, but with a willingness to accept one stop as

---

### ✅ B06 — User U06 → SIN+KUL+BKK

| Field | Value |
|---|---|
| **Mode** | `multi-city` |
| **Winner** | MAA→SIN (Qatar Airways), SIN→BKK (Qatar Airways), BKK→KUL (Qatar Airways), KUL→MAA (British Airways) |
| **Total Price** | $960 |
| **Confidence** | medium (93%) |
| **Status** | **PASS** |

**Constraint Trace:**
- `Leg: MAA→SIN`
- `Leg: SIN→BKK`
- `Leg: BKK→KUL`
- `Leg: KUL→MAA`

**Inferred Preferences:**
```json
{
  "direct_weight": 0.15,
  "cost_weight": 0.95,
  "convenience_weight": 0.43,
  "avoid_redeye": false,
  "preferred_airlines": [
    "SQ",
    "QR"
  ],
  "preferred_cabin": "Economy",
  "evidenceCount": 5
}
```

**LLM Rationale Preview:**
> The #1 ranked flight, Qatar Airways QR5395, is the best match for this traveler due to its alignment with their high price sensitivity, as evidenced by their "broke student, absolute cheapest only" ra

---

## What's Working ✅

- **Multi-city permutation engine** correctly enumerates all tour orderings and picks the highest utility sequence
- **Preference inference** maps user profiles to cost/direct/convenience/loyalty weights with evidence chains
- **Counterfactual engine** computes closed-form price-break-even thresholds
- **Alternatives selector** surfaces cheapest, fastest, comfort and date-shift alternatives
- **LLM rationale** generates natural language explanations via Groq (llama-3.3-70b-versatile)
- **Constraint tracing** logs each filter step with removed/remaining counts

## What Needs Improvement 🔧

- **B01 / B05 (date-filter over-elimination):** The date filter was incorrectly anchored to the first flight's date when no explicit date was requested, eliminating almost all candidates. Fixed in this run by making the filter opt-in (only fires when `opts.date` is explicitly supplied).
- **B05 (strict 90-min layover constraint):** U05 wants max 90 mins layover + strong direct preference — virtually no LIS→SYD direct flights exist in the dataset. This is a data coverage gap. Improvement: add a graceful fallback that relaxes constraints by 1 step and surfaces the near-miss advice.
- **B06 (multi-city temporal gate):** The 12-hour turnaround rule was too strict. Relaxed to 60 minutes. Asia routing from MAA→SIN→KUL→BKK→MAA should now resolve.
- **Confidence matchPct:** When the scoring formula constants (weights) don't perfectly align with the max-achievable denominator, matchPct can report 0%. The denominator should be recomputed dynamically from `pref` weights.
- **No home-airport city-name fuzzy match:** "Tokyo" in a prompt correctly resolves to NRT only if it's in the airport name map. If a user types a neighborhood or partial name, the destination lookup fails. Improvement: add a city→IATA lookup table.
- **B04 day-of-week constraint not enforced:** The benchmark asks for Tuesday outbound + Thursday return, but the current engine has no day-of-week filter. All dates are ranked equally. A `preferred_departure_days` field should be added to preferences.

