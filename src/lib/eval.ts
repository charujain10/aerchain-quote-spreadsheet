import truth from "@/data/ground-truth.json";
import type { DemoSession } from "./types";
import { allGates } from "./qualify";

type Truth = {
  fxUsdInr: number;
  vendors: Record<string, { gate: string; lines: Record<string, { price: number; currency: "INR" | "USD" }>; missing: string[] }>;
};
const T = truth as unknown as Truth;

export type EvalRow = {
  vendorId: string;
  truthCells: number;
  correct: number;
  wrongFlagged: number;
  wrongSilent: number;
  notExtracted: number;
  missingDetected: string;
  gate: { expected: string; actual: string; ok: boolean };
  wrongSilentLines: string[];
};

/**
 * Because the demo dataset is fabricated, we know the right answer for every cell. This scores the
 * pipeline against it. The number that matters is wrongSilent: errors the UI did NOT flag for review.
 */
export function evaluate(s: DemoSession): { rows: EvalRow[]; totals: { cells: number; correct: number; wrongFlagged: number; wrongSilent: number; accuracyPct: number } } {
  const gates = new Map(allGates(s).map((g) => [g.vendorId, g]));
  const rows: EvalRow[] = [];
  for (const v of s.vendors) {
    const t = T.vendors[v.vendorId];
    if (!t) continue;
    let correct = 0, wrongFlagged = 0, wrongSilent = 0, notExtracted = 0;
    const silent: string[] = [];
    for (const [lineId, exp] of Object.entries(t.lines)) {
      const expected = exp.currency === "USD" ? exp.price * s.fxUsdInr : exp.price;
      const cell = s.normalized.find((c) => c.vendorId === v.vendorId && c.lineId === lineId);
      // "Correct" is judged on the machine's own output, so ignore buyer overrides/confirmations.
      const got = cell?.buyer?.action === "overridden" ? null : cell?.netInr;
      if (cell == null || cell.status === "missing" || got == null) { notExtracted++; continue; }
      if (Math.abs(got - expected) / expected <= 0.01) correct++;
      else if (cell.status === "review" || cell.status === "excluded") wrongFlagged++;
      else { wrongSilent++; silent.push(`${lineId}: got ${got.toFixed(2)}, expected ${expected.toFixed(2)}`); }
    }
    const actualMissing = s.normalized.filter((c) => c.vendorId === v.vendorId && c.status === "missing").map((c) => c.lineId).sort();
    const expMissing = [...t.missing].sort();
    const g = gates.get(v.vendorId)!;
    rows.push({
      vendorId: v.vendorId,
      truthCells: Object.keys(t.lines).length,
      correct, wrongFlagged, wrongSilent, notExtracted,
      missingDetected: JSON.stringify(actualMissing) === JSON.stringify(expMissing) ? "exact" : `expected ${expMissing.length}, found ${actualMissing.length}`,
      gate: { expected: t.gate, actual: g.status, ok: g.status === t.gate },
      wrongSilentLines: silent,
    });
  }
  const cells = rows.reduce((a, r) => a + r.truthCells, 0);
  const correct = rows.reduce((a, r) => a + r.correct, 0);
  return {
    rows,
    totals: {
      cells, correct,
      wrongFlagged: rows.reduce((a, r) => a + r.wrongFlagged, 0),
      wrongSilent: rows.reduce((a, r) => a + r.wrongSilent, 0),
      accuracyPct: cells ? Math.round((correct / cells) * 1000) / 10 : 0,
    },
  };
}
