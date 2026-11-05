export type Uom = "box" | "set" | "pair" | "kg";

export type RfxLine = {
  lineId: string;
  sku: string;
  description: string;
  uom: Uom;
  qty: number;
  targetInrPerBox: number;
};

export type Questionnaire = {
  iso9001: boolean;
  brcgs: boolean;
  moistureReport: boolean;
  auditScore: number;
};

export type VendorMeta = {
  id: string;
  name: string;
  currency: "INR" | "USD";
};

export type RawQuoteRow = {
  lineId?: string;
  skuHint?: string;
  descriptionHint?: string;
  unitPrice: number;
  currency: "INR" | "USD";
  uomQuoted: string;
  sourceSnippet: string;
  confidence: number;
};

export type NormalizedQuoteCell = {
  lineId: string;
  vendorId: string;
  unitPriceInr: number | null;
  uomNormalized: Uom;
  quoted: boolean;
  confidence: number;
  flags: string[];
  provenance: string;
};

export type VendorResponse = {
  vendorId: string;
  vendorName: string;
  fileName: string;
  rawText: string;
  questionnaire: Questionnaire;
  rows: RawQuoteRow[];
  warnings: string[];
};

export type DemoSession = {
  rfxId: string;
  title: string;
  lines: RfxLine[];
  vendors: VendorResponse[];
  normalized: NormalizedQuoteCell[];
  lastYearInr: Record<string, number>;
};

export const USD_TO_INR = 83.5;

export function isQuestionnaireQualified(q: Questionnaire): boolean {
  return q.iso9001 && q.brcgs && q.moistureReport && q.auditScore >= 80;
}
