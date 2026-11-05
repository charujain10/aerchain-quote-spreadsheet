import type { DemoSession, NormalizedQuoteCell, RfxLine, VendorResponse } from "./types";
import { USD_TO_INR, isQuestionnaireQualified } from "./types";

function toInr(price: number, currency: "INR" | "USD"): number {
  return currency === "USD" ? price * USD_TO_INR : price;
}

export function normalizeVendor(lines: RfxLine[], vendor: VendorResponse): NormalizedQuoteCell[] {
  const cells: NormalizedQuoteCell[] = [];
  for (const line of lines) {
    const row = vendor.rows.find((r) => r.lineId === line.lineId);
    if (!row) {
      cells.push({
        lineId: line.lineId,
        vendorId: vendor.vendorId,
        unitPriceInr: null,
        uomNormalized: line.uom,
        quoted: false,
        confidence: 0,
        flags: ["missing_line"],
        provenance: "No quote found in attachment",
      });
      continue;
    }
    const flags: string[] = [];
    let confidence = row.confidence;
    if (row.uomQuoted.includes("100")) {
      flags.push("uom_per_100");
    }
    if (row.uomQuoted === "kg") {
      flags.push("uom_kg_converted");
      confidence -= 0.05;
    }
    if (row.currency === "USD") {
      flags.push("currency_usd");
    }
    if (confidence < 0.75) flags.push("review_recommended");

    cells.push({
      lineId: line.lineId,
      vendorId: vendor.vendorId,
      unitPriceInr: Math.round(toInr(row.unitPrice, row.currency) * 1000) / 1000,
      uomNormalized: line.uom,
      quoted: true,
      confidence,
      flags,
      provenance: row.sourceSnippet,
    });
  }
  return cells;
}

export function rebuildNormalized(session: DemoSession): NormalizedQuoteCell[] {
  const all: NormalizedQuoteCell[] = [];
  for (const v of session.vendors) {
    all.push(...normalizeVendor(session.lines, v));
  }
  return all;
}

export function vendorCoverage(vendor: VendorResponse, lineCount: number): number {
  return vendor.rows.filter((r) => r.lineId).length / lineCount;
}

export function qualifiedVendorIds(session: DemoSession): string[] {
  return session.vendors.filter((v) => isQuestionnaireQualified(v.questionnaire)).map((v) => v.vendorId);
}

export type SplitAwardRow = {
  lineId: string;
  sku: string;
  vendorId: string;
  vendorName: string;
  unitPriceInr: number;
};

export function computeSplitAwardCheapestQualified(
  session: DemoSession,
  onlyQualified: boolean
): { rows: SplitAwardRow[]; totalInr: number; skipped: string[] } {
  const qualified = new Set(onlyQualified ? qualifiedVendorIds(session) : session.vendors.map((v) => v.vendorId));
  const vendorName = (id: string) => session.vendors.find((v) => v.vendorId === id)?.vendorName ?? id;
  const rows: SplitAwardRow[] = [];
  let totalInr = 0;
  const skipped: string[] = [];

  for (const line of session.lines) {
    const candidates = session.normalized.filter(
      (c) => c.lineId === line.lineId && c.quoted && c.unitPriceInr != null && qualified.has(c.vendorId)
    );
    if (candidates.length === 0) {
      skipped.push(line.lineId);
      continue;
    }
    candidates.sort((a, b) => (a.unitPriceInr ?? 0) - (b.unitPriceInr ?? 0));
    const best = candidates[0];
    const spend = (best.unitPriceInr ?? 0) * line.qty;
    totalInr += spend;
    rows.push({
      lineId: line.lineId,
      sku: line.sku,
      vendorId: best.vendorId,
      vendorName: vendorName(best.vendorId),
      unitPriceInr: best.unitPriceInr ?? 0,
    });
  }
  return { rows, totalInr: Math.round(totalInr), skipped };
}

export function computeSingleVendorTotals(session: DemoSession): Array<{ vendorId: string; name: string; totalInr: number; linesQuoted: number }> {
  return session.vendors.map((v) => {
    let total = 0;
    let linesQuoted = 0;
    for (const line of session.lines) {
      const cell = session.normalized.find((c) => c.vendorId === v.vendorId && c.lineId === line.lineId);
      if (cell?.unitPriceInr != null) {
        total += cell.unitPriceInr * line.qty;
        linesQuoted++;
      }
    }
    return { vendorId: v.vendorId, name: v.vendorName, totalInr: Math.round(total), linesQuoted };
  });
}
