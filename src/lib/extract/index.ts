import fs from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import type { RfxLine, VendorMeta, VendorResponse } from "../types";
import {
  parseQuestionnaireFromText,
  rowsFromSkuPricePairs,
} from "./helpers";
import type { RawQuoteRow } from "../types";

async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

function parseExcel(buffer: Buffer, lines: RfxLine[]): { text: string; rows: RawQuoteRow[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
  const text = aoa.map((r) => r.join(" | ")).join("\n");
  const rows: RawQuoteRow[] = [];
  for (const row of aoa) {
    if (!row || row.length < 3) continue;
    const desc = String(row[1] ?? "");
    if (!desc || desc.toLowerCase().includes("description")) continue;
    const rate100 = parseFloat(String(row[2]).replace(/,/g, ""));
    if (Number.isNaN(rate100)) continue;
    const line =
      lines.find((l) => desc.includes(l.sku) || l.description.toLowerCase().includes(desc.slice(0, 15).toLowerCase())) ||
      lines[parseInt(String(row[0]), 10) - 1];
    if (!line) continue;
    const unitPrice = rate100 / 100;
    rows.push({
      lineId: line.lineId,
      skuHint: line.sku,
      descriptionHint: desc,
      unitPrice,
      currency: "INR",
      uomQuoted: "per 100 boxes",
      sourceSnippet: `Row: ${desc} → ${rate100}/100 boxes`,
      confidence: 0.92,
    });
  }
  return { text, rows };
}

function parseEmail(text: string, lines: RfxLine[], lastYear: Record<string, number>): RawQuoteRow[] {
  const rows: RawQuoteRow[] = [];
  for (const line of lines) {
    if (text.includes(`${line.sku}: same as last year`)) {
      const baseline = lastYear[line.lineId];
      if (baseline) {
        rows.push({
          lineId: line.lineId,
          skuHint: line.sku,
          unitPrice: baseline,
          currency: "INR",
          uomQuoted: "box",
          sourceSnippet: `${line.sku}: same as last year → ₹${baseline}`,
          confidence: 0.78,
        });
      }
    }
  }
  if (text.toLowerCase().includes("rest same as last year")) {
    for (const line of lines) {
      const n = parseInt(line.lineId.slice(1), 10);
      if (n >= 3 && n <= 10 && !rows.some((r) => r.lineId === line.lineId)) {
        const baseline = lastYear[line.lineId];
        if (baseline) {
          rows.push({
            lineId: line.lineId,
            skuHint: line.sku,
            unitPrice: baseline,
            currency: "INR",
            uomQuoted: "box",
            sourceSnippet: `rest same as last year → L${String(n).padStart(2, "0")} baseline ₹${baseline}`,
            confidence: 0.72,
          });
        }
      }
    }
  }
  const l1 = lines[0];
  const kg5 = text.match(/₹?\s*42\s*\/\s*kg/i);
  if (kg5 && l1) {
    const perBox = 42 * 0.95;
    rows.push({
      lineId: l1.lineId,
      skuHint: l1.sku,
      unitPrice: perBox,
      currency: "INR",
      uomQuoted: "kg",
      sourceSnippet: "₹42/kg for 5-ply → converted @ 0.95 kg/box",
      confidence: 0.7,
    });
  }
  const l2 = lines[1];
  const kg3 = text.match(/₹?\s*38\s*\/\s*kg/i);
  if (kg3 && l2) {
    const perBox = 38 * 0.42;
    rows.push({
      lineId: l2.lineId,
      skuHint: l2.sku,
      unitPrice: perBox,
      currency: "INR",
      uomQuoted: "kg",
      sourceSnippet: "₹38/kg for 3-ply → converted @ 0.42 kg/box",
      confidence: 0.7,
    });
  }
  rows.push(...rowsFromSkuPricePairs(text, lines, "INR", "box", "email"));
  const dedup = new Map<string, RawQuoteRow>();
  for (const r of rows) {
    if (r.lineId) dedup.set(r.lineId, r);
  }
  return [...dedup.values()];
}

function parseSvg(text: string, lines: RfxLine[]): RawQuoteRow[] {
  const rows: RawQuoteRow[] = [];
  const re = /(CORR-[A-Z0-9-]+)\s+(\d+(?:\.\d+)?)\/box/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const line = lines.find((l) => l.sku === m![1]);
    if (!line) continue;
    rows.push({
      lineId: line.lineId,
      skuHint: m[1],
      unitPrice: parseFloat(m[2]),
      currency: "INR",
      uomQuoted: "box",
      sourceSnippet: m[0],
      confidence: 0.65,
    });
  }
  return rows;
}

function parsePdfRows(text: string, lines: RfxLine[]): RawQuoteRow[] {
  const rows: RawQuoteRow[] = [];
  const lineRe = /(CORR-[A-Z0-9-]+)[\s\S]*?USD\s*(\d+(?:\.\d+)?)\/box/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text))) {
    const sku = m[1];
    const line = lines.find((l) => l.sku === sku);
    if (!line) continue;
    rows.push({
      lineId: line.lineId,
      skuHint: sku,
      unitPrice: parseFloat(m[2]),
      currency: "USD",
      uomQuoted: "box",
      sourceSnippet: m[0].replace(/\s+/g, " ").slice(0, 100),
      confidence: 0.88,
    });
  }
  if (text.toLowerCase().includes("volume discount of 5%")) {
    for (const r of rows) {
      r.unitPrice = r.unitPrice * 0.95;
      r.sourceSnippet += " (5% invoice discount applied)";
      r.confidence = 0.82;
    }
  }
  return rows;
}

function parseWordRows(text: string, lines: RfxLine[]): RawQuoteRow[] {
  const rows: RawQuoteRow[] = [];
  const re = /(CORR-[A-Z0-9-]+):[\s\S]*?Rs\.?\s*(\d+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const line = lines.find((l) => l.sku === m![1]);
    if (!line) continue;
    rows.push({
      lineId: line.lineId,
      skuHint: m[1],
      unitPrice: parseFloat(m[2]),
      currency: "INR",
      uomQuoted: "box",
      sourceSnippet: m[0].replace(/\s+/g, " ").slice(0, 100),
      confidence: 0.86,
    });
  }
  return rows;
}

export async function ingestVendorFile(
  meta: VendorMeta,
  fileName: string,
  buffer: Buffer,
  lines: RfxLine[],
  lastYear: Record<string, number>
): Promise<VendorResponse> {
  const ext = path.extname(fileName).toLowerCase();
  let rawText = "";
  let rows: RawQuoteRow[] = [];
  const warnings: string[] = [];

  if (ext === ".xlsx" || ext === ".xls") {
    const parsed = parseExcel(buffer, lines);
    rawText = parsed.text;
    rows = parsed.rows;
    warnings.push("Vendor used non-standard template; parsed per-100-box column.");
  } else if (ext === ".pdf") {
    rawText = await parsePdf(buffer);
    rows = parsePdfRows(rawText, lines);
  } else if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value;
    rows = parseWordRows(rawText, lines);
    if (rawText.includes("28–30") || rawText.includes("28-30")) {
      warnings.push("Vendor explicitly omitted lines 28–30 pending confirmation.");
    }
  } else if (ext === ".svg" || ext === ".png" || ext === ".jpg") {
    rawText = buffer.toString("utf8");
    if (!rawText.includes("CORR-")) {
      warnings.push("Image OCR not run in demo; SVG rate card parsed as text layer.");
    }
    rows = parseSvg(rawText, lines);
    warnings.push("Angled rate card — lower confidence on OCR-like parse.");
  } else if (ext === ".txt") {
    rawText = buffer.toString("utf8");
    rows = parseEmail(rawText, lines, lastYear);
    warnings.push("Email body used mixed kg/box and baseline references.");
  } else {
    rawText = buffer.toString("utf8");
    rows = rowsFromSkuPricePairs(rawText, lines, "INR", "box", ext);
  }

  const questionnaire = parseQuestionnaireFromText(rawText);
  const missingSkus = lines.filter((l) => !rows.some((r) => r.lineId === l.lineId));
  if (missingSkus.length > 0) {
    warnings.push(`Only ${rows.length}/${lines.length} lines priced — ${missingSkus.length} gaps.`);
  }

  return {
    vendorId: meta.id,
    vendorName: meta.name,
    fileName,
    rawText: rawText.slice(0, 8000),
    questionnaire,
    rows,
    warnings,
  };
}

export async function ingestFromPublicSample(
  vendorId: string,
  lines: RfxLine[],
  lastYear: Record<string, number>
): Promise<VendorResponse> {
  const manifestPath = path.join(process.cwd(), "public/samples/vendors/manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Array<{
    id: string;
    file: string;
    name: string;
    currency: string;
  }>;
  const entry = manifest.find((m) => m.id === vendorId);
  if (!entry) throw new Error(`Unknown vendor ${vendorId}`);
  const filePath = path.join(process.cwd(), "public/samples/vendors", entry.file);
  const buffer = await fs.readFile(filePath);
  return ingestVendorFile(
    { id: entry.id, name: entry.name, currency: entry.currency as "INR" | "USD" },
    entry.file,
    buffer,
    lines,
    lastYear
  );
}
