# Saarathi — Custom Benchmark Results

**Date:** 2026-07-10T21:35:46.154Z
**API:** http://localhost:4000

## Summary

| ✅ PASS | ⚠️ PARTIAL | ❌ FAIL | Total |
|:---:|:---:|:---:|:---:|
| 8 | 0 | 0 | 8 |

## Scenario Results

### ✅ C01

> U04 (MEL→JFK) — Tuesday/Thursday day-of-week signal in text should boost matching departures

| Mode | Winner | Price | Confidence | Time | Status |
|---|---|---|---|---|---|
| `single-leg` | Air India AI5508 | $1529.49 | medium (100%) | 893ms | **PASS** |

**Checks:**
- ✅ Has a winner flight
- ✅ Mode is single-leg
- ✅ Preference weights inferred
- ✅ At least 1 ranked flight (got 43)

---

### ✅ C02

> U01 (CPT→NRT) — bags_matter perturbation should change the verdict or ranking order

| Mode | Winner | Price | Confidence | Time | Status |
|---|---|---|---|---|---|
| `single-leg` | American Airlines AA351 | $1571.95 | medium (88%) | 655ms | **PASS** |

**Checks:**
- ✅ Has a base winner
- ✅ Has counterfactuals (decision boundaries)

---

### ✅ C03

> U03 (AMS→DPS) — with bags_matter perturbation: baggage-included flights score higher

| Mode | Winner | Price | Confidence | Time | Status |
|---|---|---|---|---|---|
| `single-leg` | Thai Airways TG4969 | $1063.35 | medium (91%) | 1049ms | **PASS** |

**Checks:**
- ✅ Winner exists with bags_matter
- ✅ bags_matter perturbation was applied
- ✅ Winner has baggage included when bags_matter=true

---

### ✅ C04

> U05 (LIS→SYD) — with accept_one_stop perturbation should find more options than baseline

| Mode | Winner | Price | Confidence | Time | Status |
|---|---|---|---|---|---|
| `single-leg` | ANA NH9376;NH796 | $1439.76 | low (68%) | 857ms | **PASS** |

**Checks:**
- ✅ accept_one_stop perturbation acknowledged
- ✅ Ranked list returned (9 items)

---

### ✅ C05

> U02 (MEX) — 2-city: just Paris + back (MEX→CDG→MEX)

| Mode | Winner | Price | Confidence | Time | Status |
|---|---|---|---|---|---|
| `multi-city` | MEX→CDG, CDG→MEX | $1793 | high (95%) | 866ms | **PASS** |

**Checks:**
- ✅ Mode is multi-city
- ✅ 2-leg circuit (got 2 legs)
- ✅ First leg departs from MEX (home)
- ✅ Last leg returns to MEX (home)

---

### ✅ C06

> U01 (CPT→NRT) — ignore_loyalty perturbation should not penalise non-AA airlines

| Mode | Winner | Price | Confidence | Time | Status |
|---|---|---|---|---|---|
| `single-leg` | Korean Air KE3237 | $5093.16 | medium (87%) | 770ms | **PASS** |

**Checks:**
- ✅ Has winner with ignore_loyalty
- ✅ ignore_loyalty perturbation in appliedPerturbations

---

### ✅ C07

> U04 (MEL) — 3-city Asia: Bangkok + Singapore + back

| Mode | Winner | Price | Confidence | Time | Status |
|---|---|---|---|---|---|
| `multi-city` | MEL→BKK, BKK→SIN, SIN→MEL | $1325 | medium (85%) | 983ms | **PASS** |

**Checks:**
- ✅ Mode is multi-city
- ✅ At least 3 legs (got 3)
- ✅ Total price computed: $1325

---

### ✅ C08

> U02 (MEX→CDG) — high matchPct should not return tier=low

| Mode | Winner | Price | Confidence | Time | Status |
|---|---|---|---|---|---|
| `single-leg` | Singapore Airlines SQ3983 | $940.88 | medium (95%) | 983ms | **PASS** |

**Checks:**
- ✅ Has winner
- ✅ matchPct is defined (95%)
- ✅ Tier is not 'low' when matchPct >= 80 (tier=medium, pct=95)

---

