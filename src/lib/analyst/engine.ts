import type { DemoSession } from "@/lib/types";
import {
  computeSingleVendorTotals,
  computeSplitAwardCheapestQualified,
  qualifiedVendorIds,
} from "@/lib/normalize";
import { isQuestionnaireQualified } from "@/lib/types";

export type AnalystResult =
  | { kind: "text"; text: string }
  | { kind: "table"; title: string; columns: string[]; rows: string[][] }
  | { kind: "chart"; title: string; points: { label: string; value: number }[] };

function fmtInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function answerQuestion(session: DemoSession, question: string): AnalystResult[] {
  const q = question.toLowerCase();
  const results: AnalystResult[] = [];

  if (q.includes("qualified") || q.includes("questionnaire") || q.includes("quality")) {
    const rows = session.vendors.map((v) => [
      v.vendorName,
      v.questionnaire.iso9001 ? "Yes" : "No",
      v.questionnaire.brcgs ? "Yes" : "No",
      v.questionnaire.moistureReport ? "Yes" : "No",
      String(v.questionnaire.auditScore),
      isQuestionnaireQualified(v.questionnaire) ? "PASS" : "FAIL",
    ]);
    results.push({
      kind: "table",
      title: "Supplier questionnaire summary",
      columns: ["Vendor", "ISO", "BRCGS", "Moisture", "Audit", "Gate"],
      rows,
    });
  }

  if (
    (q.includes("split") && q.includes("line")) ||
    (q.includes("cheapest") && q.includes("line") && q.includes("vendor"))
  ) {
    const onlyQualified = q.includes("quality") || q.includes("questionnaire") || q.includes("cleared");
    const split = computeSplitAwardCheapestQualified(session, onlyQualified);
    results.push({
      kind: "text",
      text: onlyQualified
        ? "Split award: cheapest per line among vendors who **passed** the quality questionnaire."
        : "Split award: cheapest per line across all vendors (no quality filter).",
    });
    results.push({
      kind: "table",
      title: "Recommended split (excerpt — first 10 lines)",
      columns: ["Line", "SKU", "Vendor", "INR/box"],
      rows: split.rows.slice(0, 10).map((r) => [r.lineId, r.sku, r.vendorName, fmtInr(r.unitPriceInr)]),
    });
    results.push({
      kind: "text",
      text: `Estimated annual spend (quoted lines only): **${fmtInr(split.totalInr)}**. Lines without qualified quotes: ${split.skipped.length ? split.skipped.join(", ") : "none"}.`,
    });
  }

  if (q.includes("compare") || q.includes("total") || q.includes("single vendor")) {
    const totals = computeSingleVendorTotals(session);
    results.push({
      kind: "table",
      title: "Single-vendor award totals (annualized, quoted lines only)",
      columns: ["Vendor", "Lines quoted", "Est. spend INR"],
      rows: totals
        .sort((a, b) => a.totalInr - b.totalInr)
        .map((t) => [t.name, String(t.linesQuoted), fmtInr(t.totalInr)]),
    });
    results.push({
      kind: "chart",
      title: "Total spend by vendor (INR)",
      points: totals.map((t) => ({ label: t.name.split(" ")[0], value: t.totalInr })),
    });
  }

  if (q.includes("unsure") || q.includes("confidence") || q.includes("review")) {
    const low = session.normalized.filter((c) => c.confidence < 0.75 || c.flags.includes("review_recommended"));
    results.push({
      kind: "table",
      title: "Cells flagged for buyer review",
      columns: ["Line", "Vendor", "Confidence", "Flags", "Provenance"],
      rows: low.slice(0, 15).map((c) => [
        c.lineId,
        c.vendorId,
        c.confidence.toFixed(2),
        c.flags.join(", ") || "—",
        c.provenance.slice(0, 60),
      ]),
    });
  }

  if (q.includes("missing") || q.includes("27") || q.includes("gap")) {
    for (const v of session.vendors) {
      const missing = session.lines.filter(
        (l) => !session.normalized.some((c) => c.vendorId === v.vendorId && c.lineId === l.lineId && c.quoted)
      );
      if (missing.length) {
        results.push({
          kind: "text",
          text: `${v.vendorName}: missing ${missing.length} lines (${missing.map((m) => m.lineId).join(", ")}).`,
        });
      }
    }
  }

  if (results.length === 0) {
    const qualified = qualifiedVendorIds(session);
    results.push({
      kind: "text",
      text: `I can analyze extracted quotes for RFx ${session.rfxId}. Try: "Split award cheapest per line among vendors who cleared quality", "Compare single-vendor totals", "Show low-confidence cells", or "Who failed questionnaire?"`,
    });
    results.push({
      kind: "text",
      text: `Loaded ${session.vendors.length} vendor responses; ${qualified.length} pass quality gate (ISO + BRCGS + moisture + audit ≥80).`,
    });
  }

  return results;
}

export const DEMO_QUESTIONS = [
  "Which vendors passed the quality questionnaire?",
  "Split award: cheapest per line among vendors who cleared the quality questionnaire",
  "Compare single-vendor totals for annual spend",
  "Show cells that need buyer review (low confidence)",
  "Which vendors have missing line quotes?",
];
