// ───────────────────────── RFx ─────────────────────────

export type Uom = "box" | "set" | "pair";

export type RfxLine = {
  lineId: string;
  sku: string;
  description: string;
  uom: Uom;
  qty: number;
  plies: number;
  /** Nominal weight per unit (kg). Published in the RFx so vendors can price per kg. */
  weightKg: number;
  targetInrPerBox: number;
  /** Buyer's own PO history (what we paid last year). Never invented by the system. */
  lastPaidInr: number;
};

export type QuestionDef = {
  id: string;
  text: string;
  type: "yesno" | "number";
  gate: { required: boolean; min?: number };
};

export type RfxTerms = {
  currency: "INR";
  deliveryLocation: string;
  paymentDays: number;
  incoterm: string;
  validityDays: number;
  notes?: string;
};

export type RfxDraft = {
  rfxId: string;
  title: string;
  category: string;
  issuedOn: string; // YYYY-MM-DD
  responseDueDate: string; // YYYY-MM-DD, also the "as of" date for certificate validity
  lineIds: string[];
  qtyOverrides: Record<string, number>;
  questionnaire: QuestionDef[];
  terms: RfxTerms;
  status: "draft" | "sent";
  email?: { subject: string; body: string };
};

// ───────────────────────── Extraction (what the LLM reads off the page) ─────────────────────────

export type PriceBasis = "per_unit" | "per_100" | "per_1000" | "per_kg" | "same_as_last_year" | "other";

export type ExtractedQuote = {
  lineId: string;
  matchedBy: "sku" | "description" | "position" | "scope_inference";
  /** Price exactly as written in the document. null when the vendor gave no number (e.g. "same as last year"). */
  price: number | null;
  currency: string;
  basis: PriceBasis;
  basisNote?: string;
  /** Only when the document itself states a kg-per-unit figure. */
  kgPerUnit?: number | null;
  /** Verbatim text from the document supporting this row. */
  evidence: string;
  location?: string;
  confidence: number;
  confidenceReason: string;
  /** Set when the model had to interpret scope or meaning (e.g. "applied to all 5-ply lines"). */
  interpretation?: string;
  specDeviation?: string;
  /** Set by the system (not the model): did the quoted evidence actually appear in the source text? */
  evidenceVerified?: boolean;
};

export type ExtractedDiscount = {
  description: string;
  percent: number | null;
  conditional: boolean;
  condition?: string;
  evidence?: string;
};

export type ExtractedTerms = {
  incoterm?: string;
  freight: "included" | "extra" | "unspecified";
  freightNote?: string;
  paymentTerms?: string;
  validity?: string;
  moq?: string;
  gst?: string;
  leadTime?: string;
  discounts: ExtractedDiscount[];
  other: string[];
};

export type QuestionAnswer = {
  questionId: string;
  answer: "yes" | "no" | "not_stated" | number;
  evidence?: string;
};

export type DocType =
  | "iso_9001_certificate"
  | "brcgs_certificate"
  | "moisture_test_report"
  | "audit_report"
  | "other";

export type ExtractedDoc = {
  fileName: string;
  docType: DocType;
  issuer?: string;
  /** YYYY-MM-DD when the document states an expiry / valid-until date. */
  validUntil?: string;
  summary: string;
};

export type VendorExtraction = {
  quotes: ExtractedQuote[];
  omitted: { lineId: string; reason: string }[];
  terms: ExtractedTerms;
  answers: QuestionAnswer[];
  documents: ExtractedDoc[];
  notes: string[];
};

export type VendorFile = { name: string; role: "response" | "attachment"; kind: string };

export type VendorResponse = {
  vendorId: string;
  vendorName: string;
  files: VendorFile[];
  extraction: VendorExtraction;
  /** Text layer of the source documents, kept so evidence quotes can be verified. */
  sourceText: string;
  /** Rows the system refused (unknown line, bad schema…). Shown, never silently dropped. */
  rejected: string[];
  warnings: string[];
  fromCache: boolean;
};

// ───────────────────────── Normalized comparison ─────────────────────────

export type Flag =
  | "unit_per_100"
  | "unit_per_1000"
  | "kg_converted_nominal_weight"
  | "kg_converted_stated_weight"
  | "baseline_from_buyer_history"
  | "scope_inference"
  | "usd_converted"
  | "spec_deviation"
  | "evidence_not_found"
  | "price_outlier"
  | "duplicate_quote"
  | "unsupported_currency"
  | "discount_applied"
  | "conditional_discount_available"
  | "low_confidence";

export const BLOCKING_FLAGS: Flag[] = [
  "baseline_from_buyer_history",
  "scope_inference",
  "kg_converted_nominal_weight",
  "spec_deviation",
  "evidence_not_found",
  "price_outlier",
  "duplicate_quote",
  "low_confidence",
];

export type CellStatus = "ok" | "review" | "confirmed" | "missing" | "excluded";

export type NormalizedCell = {
  lineId: string;
  vendorId: string;
  status: CellStatus;
  quoted: { price: number | null; currency: string; basis: PriceBasis } | null;
  /** INR per unit, after unit + currency conversion, before discounts. */
  unitInr: number | null;
  /** After unconditional discounts. */
  netInr: number | null;
  /** After unconditional AND conditional discounts (scenario). */
  netIfConditionalInr: number | null;
  confidence: number;
  flags: Flag[];
  evidence: string;
  location?: string;
  interpretation?: string;
  note?: string;
  buyer?: { action: "confirmed" | "overridden"; price?: number };
};

export type BuyerAction = { action: "confirmed" | "overridden"; price?: number };

// ───────────────────────── Session ─────────────────────────

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type DemoSession = {
  rfx: RfxDraft;
  lines: RfxLine[];
  vendors: VendorResponse[];
  normalized: NormalizedCell[];
  buyerActions: Record<string, BuyerAction>; // key `${vendorId}:${lineId}`
  /** Buyer-editable assumption. Shown in the UI; never silently baked in. */
  fxUsdInr: number;
  copilotMessages: unknown[]; // Anthropic MessageParam[]
  copilotTranscript: ChatTurn[];
  analystTranscript: ChatTurn[];
};

export const DEFAULT_FX_USD_INR = 88;
