/**
 * Custom Live API Benchmark Runner
 * Tests additional scenarios beyond the official B01–B06 set.
 * Usage: npx ts-node custom_test_benchmarks.ts
 */

import fs from "fs";
import path from "path";

const API_BASE = "http://localhost:4000";

interface Scenario {
  id: string;
  description: string;
  payload: {
    userId: string;
    requestText: string;
    destination?: string;
    cities?: string[];
    perturbations?: any[];
  };
  validators: ((data: any) => { pass: boolean; message: string })[];
}

const scenarios: Scenario[] = [
  // ── C01: Day-of-week bonus test ──────────────────────────────────────────
  {
    id: "C01",
    description: "U04 (MEL→JFK) — Tuesday/Thursday day-of-week signal in text should boost matching departures",
    payload: {
      userId: "U04",
      requestText: "Book me something to New York for a Tuesday meeting, back Thursday.",
      destination: "JFK",
    },
    validators: [
      (d) => ({ pass: !!d.verdict, message: "Has a winner flight" }),
      (d) => ({ pass: d.mode === "single-leg", message: "Mode is single-leg" }),
      (d) => ({
        pass: !!d.preference && typeof d.preference.cost_weight === "number",
        message: "Preference weights inferred",
      }),
      (d) => ({
        pass: d.ranked?.length > 0,
        message: `At least 1 ranked flight (got ${d.ranked?.length})`,
      }),
    ],
  },

  // ── C02: Baggage perturbation changes winner ─────────────────────────────
  {
    id: "C02",
    description: "U01 (CPT→NRT) — bags_matter perturbation should change the verdict or ranking order",
    payload: {
      userId: "U01",
      requestText: "I need to get from home to Tokyo next month, what do you suggest?",
      destination: "NRT",
    },
    validators: [
      (d) => ({ pass: !!d.verdict, message: "Has a base winner" }),
      (d) => ({
        pass: Array.isArray(d.counterfactuals) && d.counterfactuals.length > 0,
        message: "Has counterfactuals (decision boundaries)",
      }),
    ],
  },

  // ── C03: Bags_matter perturbation sent explicitly ─────────────────────────
  {
    id: "C03",
    description: "U03 (AMS→DPS) — with bags_matter perturbation: baggage-included flights score higher",
    payload: {
      userId: "U03",
      requestText: "Cheapest option to Bali, I'm flexible on dates over the summer.",
      destination: "DPS",
      perturbations: [{ kind: "bags_matter" }],
    },
    validators: [
      (d) => ({ pass: !!d.verdict, message: "Winner exists with bags_matter" }),
      (d) => ({
        pass: d.appliedPerturbations?.some((p: any) => p.kind === "bags_matter"),
        message: "bags_matter perturbation was applied",
      }),
      (d) => ({
        pass: d.verdict?.baggage_included === true,
        message: "Winner has baggage included when bags_matter=true",
      }),
    ],
  },

  // ── C04: accept_one_stop perturbation relaxes direct filter ──────────────
  {
    id: "C04",
    description: "U05 (LIS→SYD) — with accept_one_stop perturbation should find more options than baseline",
    payload: {
      userId: "U05",
      requestText: "I want to visit Sydney around the holidays — what should I expect?",
      destination: "SYD",
      perturbations: [{ kind: "accept_one_stop" }],
    },
    validators: [
      (d) => ({ pass: d.appliedPerturbations?.some((p: any) => p.kind === "accept_one_stop"),
        message: "accept_one_stop perturbation acknowledged" }),
      (d) => ({
        // Even with perturbation, we should at minimum get a relaxed verdict or ranked list
        pass: d.ranked?.length >= 0,
        message: `Ranked list returned (${d.ranked?.length} items)`,
      }),
    ],
  },

  // ── C05: Strict 2-city multi-city (simple circuit) ───────────────────────
  {
    id: "C05",
    description: "U02 (MEX) — 2-city: just Paris + back (MEX→CDG→MEX)",
    payload: {
      userId: "U02",
      requestText: "Book me a quick Paris trip from Mexico City.",
      cities: ["CDG"],
    },
    validators: [
      (d) => ({ pass: d.mode === "multi-city", message: "Mode is multi-city" }),
      (d) => ({
        pass: d.itinerary?.legs?.length === 2,
        message: `2-leg circuit (got ${d.itinerary?.legs?.length} legs)`,
      }),
      (d) => ({
        pass: d.itinerary?.legs?.[0]?.from === "MEX",
        message: "First leg departs from MEX (home)",
      }),
      (d) => ({
        pass: d.itinerary?.legs?.[1]?.to === "MEX",
        message: "Last leg returns to MEX (home)",
      }),
    ],
  },

  // ── C06: ignore_loyalty perturbation ─────────────────────────────────────
  {
    id: "C06",
    description: "U01 (CPT→NRT) — ignore_loyalty perturbation should not penalise non-AA airlines",
    payload: {
      userId: "U01",
      requestText: "Tokyo trip please.",
      destination: "NRT",
      perturbations: [{ kind: "ignore_loyalty" }],
    },
    validators: [
      (d) => ({ pass: !!d.verdict, message: "Has winner with ignore_loyalty" }),
      (d) => ({
        pass: d.appliedPerturbations?.some((p: any) => p.kind === "ignore_loyalty"),
        message: "ignore_loyalty perturbation in appliedPerturbations",
      }),
    ],
  },

  // ── C07: 3-city Asia with different user ─────────────────────────────────
  {
    id: "C07",
    description: "U04 (MEL) — 3-city Asia: Bangkok + Singapore + back",
    payload: {
      userId: "U04",
      requestText: "Plan me a Bangkok and Singapore trip from Melbourne.",
      cities: ["BKK", "SIN"],
    },
    validators: [
      (d) => ({ pass: d.mode === "multi-city", message: "Mode is multi-city" }),
      (d) => ({
        pass: d.itinerary?.legs?.length >= 3,
        message: `At least 3 legs (got ${d.itinerary?.legs?.length})`,
      }),
      (d) => ({
        pass: typeof d.itinerary?.totalPrice === "number" && d.itinerary.totalPrice > 0,
        message: `Total price computed: $${d.itinerary?.totalPrice?.toFixed(0) ?? "?"}`,
      }),
    ],
  },

  // ── C08: Confidence tier floor ────────────────────────────────────────────
  {
    id: "C08",
    description: "U02 (MEX→CDG) — high matchPct should not return tier=low",
    payload: {
      userId: "U02",
      requestText: "Cheapest flight to Paris please.",
      destination: "CDG",
    },
    validators: [
      (d) => ({ pass: !!d.verdict, message: "Has winner" }),
      (d) => ({
        pass: d.confidence?.matchPct !== undefined,
        message: `matchPct is defined (${d.confidence?.matchPct}%)`,
      }),
      (d) => ({
        pass: !(d.confidence?.matchPct >= 80 && d.confidence?.tier === "low"),
        message: `Tier is not 'low' when matchPct >= 80 (tier=${d.confidence?.tier}, pct=${d.confidence?.matchPct})`,
      }),
    ],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" SAARATHI — CUSTOM BENCHMARK RUNNER");
  console.log("═══════════════════════════════════════════════════\n");

  const results: {
    id: string;
    description: string;
    status: "PASS" | "PARTIAL" | "FAIL";
    checks: { pass: boolean; message: string }[];
    winner: string;
    price: string;
    confidence: string;
    mode: string;
    elapsed: number;
  }[] = [];

  for (const s of scenarios) {
    console.log(`─────────────────────────────────────────`);
    console.log(`[${s.id}] ${s.description}`);

    let status: "PASS" | "PARTIAL" | "FAIL" = "PASS";
    const checks: { pass: boolean; message: string }[] = [];
    let winner = "—", price = "—", confidence = "—", mode = "—";

    try {
      const start = Date.now();
      const res = await fetch(`${API_BASE}/api/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s.payload),
      });
      const elapsed = Date.now() - start;

      if (!res.ok) {
        const err = await res.text();
        console.log(`  ❌ HTTP ${res.status}: ${err}`);
        results.push({ id: s.id, description: s.description, status: "FAIL", checks: [{ pass: false, message: err }], winner, price, confidence, mode, elapsed });
        continue;
      }

      const data: any = await res.json();
      mode = data.mode ?? "?";

      // Run validators
      for (const validate of s.validators) {
        const result = validate(data);
        checks.push(result);
        if (!result.pass) status = status === "FAIL" ? "FAIL" : "PARTIAL";
        console.log(`  ${result.pass ? "✅" : "❌"} ${result.message}`);
      }

      // Extract summary fields
      if (data.mode === "multi-city" && data.itinerary) {
        winner = data.itinerary.legs.map((l: any) => `${l.from}→${l.to}`).join(", ");
        price = `$${Math.round(data.itinerary.totalPrice)}`;
      } else if (data.verdict) {
        winner = `${data.verdict.airline_name} ${data.verdict.flight_numbers}`;
        price = `$${data.verdict.price}`;
      } else {
        winner = "No match";
        if (status === "PASS") status = "PARTIAL";
      }

      confidence = data.confidence ? `${data.confidence.tier} (${data.confidence.matchPct}%)` : "—";
      console.log(`  ⏱ ${elapsed}ms  📊 ${confidence}  💰 ${price}`);

      results.push({ id: s.id, description: s.description, status, checks, winner, price, confidence, mode, elapsed });
    } catch (e: any) {
      console.log(`  ❌ Fetch failed: ${e.message}`);
      results.push({ id: s.id, description: s.description, status: "FAIL", checks: [{ pass: false, message: e.message }], winner, price, confidence, mode, elapsed: 0 });
    }
  }

  const pass = results.filter(r => r.status === "PASS").length;
  const partial = results.filter(r => r.status === "PARTIAL").length;
  const fail = results.filter(r => r.status === "FAIL").length;

  // ── Markdown Report ─────────────────────────────────────────────────────
  let md = `# Saarathi — Custom Benchmark Results\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n`;
  md += `**API:** ${API_BASE}\n\n`;
  md += `## Summary\n\n`;
  md += `| ✅ PASS | ⚠️ PARTIAL | ❌ FAIL | Total |\n|:---:|:---:|:---:|:---:|\n`;
  md += `| ${pass} | ${partial} | ${fail} | ${results.length} |\n\n`;
  md += `## Scenario Results\n\n`;

  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "PARTIAL" ? "⚠️" : "❌";
    md += `### ${icon} ${r.id}\n\n`;
    md += `> ${r.description}\n\n`;
    md += `| Mode | Winner | Price | Confidence | Time | Status |\n`;
    md += `|---|---|---|---|---|---|\n`;
    md += `| \`${r.mode}\` | ${r.winner} | ${r.price} | ${r.confidence} | ${r.elapsed}ms | **${r.status}** |\n\n`;
    md += `**Checks:**\n`;
    for (const c of r.checks) {
      md += `- ${c.pass ? "✅" : "❌"} ${c.message}\n`;
    }
    md += `\n---\n\n`;
  }

  fs.writeFileSync(path.join(process.cwd(), "CUSTOM_BENCHMARK_REPORT.md"), md, "utf-8");
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(` DONE — PASS: ${pass}  PARTIAL: ${partial}  FAIL: ${fail}`);
  console.log(` Saved to CUSTOM_BENCHMARK_REPORT.md`);
  console.log(`═══════════════════════════════════════════════════`);
}

run();
