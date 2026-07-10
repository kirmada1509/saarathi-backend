# Saarathi Benchmark API Run Report

Date: 2026-07-10T21:17:43.660Z
API Base: http://localhost:4000

| Scenario | User | Target | Mode | Winner Flight | Price | Confidence | Rationale Preview |
|---|---|---|---|---|---|---|---|
| B01 | U01 | HND | single-leg | NO MATCHING FLIGHTS (Constraint Blocked) | N/A | low (NaN%) | No flights matched your hard constraints (layovers, dates, redeyes). Review the decision boundaries below to see what changes would produce recommenda... |
| B02 | U02 | LHR,CDG,FCO | multi-city | Itinerary: MEX➔CDG, CDG➔FCO, FCO➔LHR, LHR➔MEX | $1704.8899999999999 | high (NaN%) | The #1 ranked flight, Korean Air KE1627;KE3069, is the best match for this traveler due to their high price sensitivity, as evidenced by their raw his... |
| B03 | U03 | DPS | single-leg | Turkish Airlines TK839 (AMS➔DPS) | $1116 | high (NaN%) | The #1 ranked flight, Turkish Airlines TK839, is the best match for this traveler due to its direct flight, which aligns with their strong direct pref... |
| B04 | U04 | JFK | single-leg | Korean Air KE4751 (MEL➔JFK) | $2240.79 | low (NaN%) | The #1 ranked flight, Korean Air KE4751, is the best match for this traveler due to its moderate directness (0 stop(s)) and relatively low cost ($2241... |
| B05 | U05 | SYD | single-leg | NO MATCHING FLIGHTS (Constraint Blocked) | N/A | low (NaN%) | No flights matched your hard constraints (layovers, dates, redeyes). Review the decision boundaries below to see what changes would produce recommenda... |
| B06 | U06 | SIN,KUL | ERROR | - | - | - | {"error":"No valid multi-city routes found. Please check date constraints and connection limits."} |
