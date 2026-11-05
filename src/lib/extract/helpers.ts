import type { Questionnaire, RawQuoteRow, RfxLine } from "@/lib/types";

export function parseQuestionnaireFromText(text: string): Questionnaire {
  const lower = text.toLowerCase();
  const iso9001 = /iso\s*9001|iso certified|iso yes/.test(lower) && !/iso no/.test(lower);
  const brcgs = /brcgs yes|brcgs food|brcgs certified/.test(lower) && !/brcgs no/.test(lower);
  const moistureReport =
    (/moisture report yes|moisture test report attached|moisture yes|moisture report shared/.test(lower) ||
      /moisture report attached/.test(lower)) &&
    !/moisture report pending/.test(lower);
  const auditMatch =
    text.match(/audit score\s*(\d+)/i) ||
    text.match(/last audit score[^\d]*(\d+)/i) ||
    text.match(/audit\s+(\d+)/i);
  const auditScore = auditMatch ? parseInt(auditMatch[1], 10) : 0;
  return { iso9001, brcgs, moistureReport, auditScore };
}

export function extractSkuHints(text: string): string[] {
  const matches = text.match(/CORR-[A-Z0-9-]+/g);
  return matches ? [...new Set(matches)] : [];
}

export function matchLineId(lines: RfxLine[], hint: string): string | undefined {
  const bySku = lines.find((l) => l.sku === hint);
  if (bySku) return bySku.lineId;
  const lower = hint.toLowerCase();
  const byDesc = lines.find((l) => l.description.toLowerCase().includes(lower.slice(0, 20)));
  return byDesc?.lineId;
}

export function rowsFromSkuPricePairs(
  text: string,
  lines: RfxLine[],
  currency: "INR" | "USD",
  defaultUom: string,
  sourcePrefix: string
): RawQuoteRow[] {
  const rows: RawQuoteRow[] = [];
  const skus = extractSkuHints(text);
  for (const sku of skus) {
    const line = lines.find((l) => l.sku === sku);
    if (!line) continue;
    const skuEsc = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${skuEsc}[^\\n₹$]*?(?:₹|Rs\\.?|INR\\s*)?(\\d+(?:\\.\\d+)?)\\s*/\\s*box`, "i"),
      new RegExp(`${skuEsc}[^\\n$]*?USD\\s*(\\d+(?:\\.\\d+)?)\\s*/\\s*box`, "i"),
      new RegExp(`${skuEsc}[^\\n₹]*?(\\d+(?:\\.\\d+)?)\\s*/\\s*box`, "i"),
      new RegExp(`${skuEsc}[^\\n]*?(\\d+(?:\\.\\d+)?)`, "i"),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        rows.push({
          lineId: line.lineId,
          skuHint: sku,
          unitPrice: parseFloat(m[1]),
          currency,
          uomQuoted: defaultUom,
          sourceSnippet: m[0].slice(0, 120),
          confidence: 0.85,
        });
        break;
      }
    }
  }
  return rows;
}
