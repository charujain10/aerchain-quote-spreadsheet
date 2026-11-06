import { z } from "zod";

export const SCHEMA_VERSION = "2";

const quote = z.object({
  lineId: z.string().describe("The RFx lineId (e.g. L07) this price applies to. Must be one of the RFx lines."),
  matchedBy: z
    .enum(["sku", "description", "position", "scope_inference"])
    .describe(
      "How you matched the vendor's row to the RFx line. Use scope_inference when the vendor priced a GROUP (e.g. 'the 5-ply') and you expanded it to the matching lines."
    ),
  price: z.number().nullable().describe("The number exactly as written. null if the vendor gave no number (e.g. 'same as last year')."),
  currency: z.string().describe("ISO code as written/implied: INR, USD, EUR… Use the currency symbol/header; do not assume."),
  basis: z
    .enum(["per_unit", "per_100", "per_1000", "per_kg", "same_as_last_year", "other"])
    .describe("What the price is per, as the vendor states it. DO NOT convert; the system converts."),
  basisNote: z.string().optional().describe("Anything unusual about the unit, quoted from the source."),
  kgPerUnit: z.number().nullable().optional().describe("Only if the document itself states a kg-per-unit figure."),
  evidence: z.string().describe("Short VERBATIM excerpt from the document that supports this row (the row text, cell values, or sentence)."),
  location: z.string().optional().describe("Where: file name + page / sheet+row / paragraph / 'image, row 14'."),
  confidence: z.number().min(0).max(1).describe("0-1. Be honest: angled/blurry text, guessed matches, ambiguous units → low."),
  confidenceReason: z.string().describe("One short sentence. Why this confidence."),
  interpretation: z.string().optional().describe("If you had to interpret scope/meaning, say exactly how, e.g. 'Applied ₹42/kg to all 14 lines with 5 plies'."),
  specDeviation: z.string().optional().describe("If the vendor quotes a different spec than the RFx line (different plies, size, material), describe it."),
});

const discount = z.object({
  description: z.string(),
  percent: z.number().nullable(),
  conditional: z.boolean().describe("true if it depends on anything: volume/MOQ, payment timing, a later invoice credit, etc."),
  condition: z.string().optional(),
  evidence: z.string().optional(),
});

const terms = z.object({
  incoterm: z.string().optional().describe("e.g. FOB Dallas, FOR Bangalore, DAP. As stated."),
  freight: z.enum(["included", "extra", "unspecified"]),
  freightNote: z.string().optional(),
  paymentTerms: z.string().optional(),
  validity: z.string().optional(),
  moq: z.string().optional(),
  gst: z.string().optional(),
  leadTime: z.string().optional(),
  discounts: z.array(discount),
  other: z.array(z.string()).describe("Other commercial conditions a buyer would care about."),
});

const answer = z.object({
  questionId: z.string(),
  answer: z.string().describe("'yes', 'no', 'not_stated', or the number as a string (e.g. '88')."),
  evidence: z.string().optional().describe("Verbatim excerpt. Required unless not_stated."),
});

const doc = z.object({
  fileName: z.string(),
  docType: z.enum(["iso_9001_certificate", "brcgs_certificate", "moisture_test_report", "audit_report", "other"]),
  issuer: z.string().optional(),
  validUntil: z.string().optional().describe("YYYY-MM-DD if the document states an expiry / valid-until date."),
  summary: z.string().describe("One line: what this document is and the key fact."),
});

export const ExtractionSchema = z.object({
  quotes: z.array(quote),
  omitted: z
    .array(z.object({ lineId: z.string(), reason: z.string().describe("The vendor's stated reason, or 'not mentioned'.") }))
    .describe("RFx lines the vendor did NOT price."),
  terms,
  answers: z.array(answer).describe("One entry per questionnaire question."),
  documents: z.array(doc).describe("One entry per ATTACHMENT file (not the main response)."),
  notes: z.array(z.string()).describe("Anything else the buyer should know: caveats, conditions, ambiguities."),
});

export type ExtractionInput = z.infer<typeof ExtractionSchema>;

export function extractionJsonSchema(): Record<string, unknown> {
  const js = z.toJSONSchema(ExtractionSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}
