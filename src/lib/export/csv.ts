import type { DemoSession } from "@/lib/types";
import { computeSplitAwardCheapestQualified } from "@/lib/normalize";
import { isQuestionnaireQualified } from "@/lib/types";

function escapeCsv(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function comparisonMatrixCsv(session: DemoSession): string {
  const header = [
    "line_id",
    "sku",
    "description",
    ...session.vendors.flatMap((v) => [
      `${v.vendorId}_inr_per_box`,
      `${v.vendorId}_confidence`,
      `${v.vendorId}_flags`,
    ]),
  ];
  const lines = [header.join(",")];
  for (const line of session.lines) {
    const row: (string | number)[] = [line.lineId, line.sku, line.description];
    for (const v of session.vendors) {
      const cell = session.normalized.find((c) => c.lineId === line.lineId && c.vendorId === v.vendorId);
      row.push(
        cell?.unitPriceInr ?? "",
        cell?.quoted ? cell.confidence.toFixed(2) : "",
        cell?.flags.join(";") ?? (cell?.quoted ? "" : "missing_line")
      );
    }
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

export function questionnaireCsv(session: DemoSession): string {
  const header = ["vendor_id", "vendor_name", "iso9001", "brcgs", "moisture_report", "audit_score", "quality_gate"];
  const rows = [header.join(",")];
  for (const v of session.vendors) {
    const q = v.questionnaire;
    rows.push(
      [
        v.vendorId,
        v.vendorName,
        q.iso9001 ? "Yes" : "No",
        q.brcgs ? "Yes" : "No",
        q.moistureReport ? "Yes" : "No",
        q.auditScore,
        isQuestionnaireQualified(q) ? "PASS" : "FAIL",
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  return rows.join("\n");
}

export function splitAwardCsv(session: DemoSession, onlyQualified: boolean): string {
  const split = computeSplitAwardCheapestQualified(session, onlyQualified);
  const header = ["line_id", "sku", "vendor_id", "vendor_name", "inr_per_box", "annual_qty", "line_spend_inr"];
  const rows = [header.join(",")];
  for (const r of split.rows) {
    const line = session.lines.find((l) => l.lineId === r.lineId);
    const qty = line?.qty ?? 0;
    const spend = r.unitPriceInr * qty;
    rows.push(
      [r.lineId, r.sku, r.vendorId, r.vendorName, r.unitPriceInr.toFixed(2), qty, Math.round(spend)]
        .map(escapeCsv)
        .join(",")
    );
  }
  rows.push("");
  rows.push(escapeCsv("total_estimated_spend_inr"), escapeCsv(split.totalInr));
  rows.push(escapeCsv("lines_without_qualified_quote"), escapeCsv(split.skipped.join("; ")));
  return rows.join("\n");
}
