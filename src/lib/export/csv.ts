import type { DemoSession } from "@/lib/types";
import { computeAward, type AwardOptions } from "@/lib/award";
import { allGates } from "@/lib/qualify";
import { FLAG_LABELS } from "@/lib/normalize";

function esc(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (cells: (string | number | null | undefined)[]) => cells.map(esc).join(",");

export function comparisonCsv(s: DemoSession): string {
  const header = ["line_id", "sku", "description", "annual_qty", "target_inr", ...s.vendors.flatMap((v) => [`${v.vendorId}_net_inr`, `${v.vendorId}_status`, `${v.vendorId}_confidence`, `${v.vendorId}_flags`, `${v.vendorId}_evidence`])];
  const out = [row(header)];
  for (const l of s.lines) {
    const r: (string | number | null)[] = [l.lineId, l.sku, l.description, l.qty, l.targetInrPerBox];
    for (const v of s.vendors) {
      const c = s.normalized.find((x) => x.lineId === l.lineId && x.vendorId === v.vendorId);
      r.push(c?.netInr ?? "", c?.status ?? "", c ? c.confidence.toFixed(2) : "", c?.flags.map((f) => FLAG_LABELS[f]).join("; ") ?? "", c?.evidence ?? "");
    }
    out.push(row(r));
  }
  return out.join("\n");
}

export function questionnaireCsv(s: DemoSession): string {
  const out = [row(["vendor", "gate", "question", "answer", "verdict", "note", "evidence"])];
  for (const g of allGates(s)) {
    const name = s.vendors.find((v) => v.vendorId === g.vendorId)?.vendorName;
    for (const q of g.questions) out.push(row([name, g.status, q.text, q.answer, q.verdict, q.note, q.evidence]));
  }
  return out.join("\n");
}

export function awardCsv(s: DemoSession, o: AwardOptions): string {
  const a = computeAward(s, o);
  const out = [row(["line_id", "sku", "vendor", "annual_qty", "unit_price_inr", "spend_inr", "cell_status", "runner_up", "saving_vs_runner_up_inr"])];
  for (const x of a.allocations) out.push(row([x.lineId, x.sku, x.vendorName, x.qty, x.unitPriceInr.toFixed(2), Math.round(x.spendInr), x.cellStatus, x.runnerUpVendor, x.savingVsRunnerUpInr == null ? "" : Math.round(x.savingVsRunnerUpInr)]));
  out.push("", row(["TOTAL_INR", a.totalInr]), row(["LINES_AWARDED", `${a.coverage.linesAwarded}/${a.coverage.linesTotal}`]), row(["SPEND_ON_UNCONFIRMED_CELLS_INR", a.spendOnUnconfirmedCellsInr]));
  for (const c of a.caveats) out.push(row(["CAVEAT", c]));
  for (const e of a.excludedVendors) out.push(row(["EXCLUDED", e.vendorName, e.reason]));
  return out.join("\n");
}
