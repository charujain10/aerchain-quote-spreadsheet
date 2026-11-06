import type {
  DemoSession,
  ExtractedQuote,
  Flag,
  NormalizedCell,
  RfxLine,
  VendorResponse,
} from "./types";
import { BLOCKING_FLAGS } from "./types";

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** Confidence ceilings. The model's self-reported confidence can only go DOWN from here. */
const CAPS: Partial<Record<Flag, number>> = {
  scope_inference: 0.7,
  baseline_from_buyer_history: 0.6,
  kg_converted_nominal_weight: 0.75,
  spec_deviation: 0.6,
  evidence_not_found: 0.5,
  price_outlier: 0.4,
  duplicate_quote: 0.5,
};

export const FLAG_LABELS: Record<Flag, string> = {
  unit_per_100: "Quoted per 100 → converted",
  unit_per_1000: "Quoted per 1000 → converted",
  kg_converted_nominal_weight: "₹/kg × RFx nominal weight",
  kg_converted_stated_weight: "₹/kg × vendor-stated weight",
  baseline_from_buyer_history: "“Same as last year” → buyer's PO history",
  scope_inference: "Scope inferred (e.g. “the 5-ply”)",
  usd_converted: "USD → INR at buyer's rate",
  spec_deviation: "Vendor changed the spec",
  evidence_not_found: "Quote not found verbatim in source",
  price_outlier: "Far from last-paid price — check units",
  duplicate_quote: "Conflicting duplicate quotes",
  unsupported_currency: "Currency not supported",
  discount_applied: "Unconditional discount applied",
  conditional_discount_available: "Conditional discount NOT applied",
  low_confidence: "Low extraction confidence",
};

function pickQuote(quotes: ExtractedQuote[]): { quote: ExtractedQuote; duplicate: boolean } | null {
  if (quotes.length === 0) return null;
  const sorted = [...quotes].sort((a, b) => b.confidence - a.confidence);
  const distinct = new Set(quotes.map((q) => `${q.price}|${q.basis}|${q.currency}`));
  return { quote: sorted[0], duplicate: distinct.size > 1 };
}

export function normalizeVendor(session: DemoSession, vendor: VendorResponse): NormalizedCell[] {
  const cells: NormalizedCell[] = [];
  const terms = vendor.extraction.terms;
  const unconditional = terms.discounts.filter((d) => !d.conditional && d.percent != null);
  const conditional = terms.discounts.filter((d) => d.conditional && d.percent != null);

  for (const line of session.lines) {
    const key = `${vendor.vendorId}:${line.lineId}`;
    const buyer = session.buyerActions[key];
    const picked = pickQuote(vendor.extraction.quotes.filter((q) => q.lineId === line.lineId));

    if (!picked) {
      const omitted = vendor.extraction.omitted.find((o) => o.lineId === line.lineId);
      cells.push({
        lineId: line.lineId,
        vendorId: vendor.vendorId,
        status: buyer?.action === "overridden" && buyer.price != null ? "confirmed" : "missing",
        quoted: null,
        unitInr: buyer?.price ?? null,
        netInr: buyer?.price ?? null,
        netIfConditionalInr: buyer?.price ?? null,
        confidence: buyer?.price != null ? 1 : 0,
        flags: [],
        evidence: "",
        note: omitted ? `Vendor: ${omitted.reason}` : "No quote found in the response",
        buyer,
      });
      continue;
    }

    const { quote, duplicate } = picked;
    const flags: Flag[] = [];
    if (duplicate) flags.push("duplicate_quote");
    if (quote.matchedBy === "scope_inference") flags.push("scope_inference");
    if (quote.specDeviation) flags.push("spec_deviation");
    if (quote.evidenceVerified === false) flags.push("evidence_not_found");

    let unitInr: number | null = null;
    let excluded = false;
    let note: string | undefined;

    // 1) basis → per unit (deterministic; the model never does this arithmetic)
    let perUnit: number | null = null;
    switch (quote.basis) {
      case "per_unit":
        perUnit = quote.price;
        break;
      case "per_100":
        perUnit = quote.price == null ? null : quote.price / 100;
        flags.push("unit_per_100");
        break;
      case "per_1000":
        perUnit = quote.price == null ? null : quote.price / 1000;
        flags.push("unit_per_1000");
        break;
      case "per_kg": {
        if (quote.price != null) {
          const stated = quote.kgPerUnit && quote.kgPerUnit > 0 ? quote.kgPerUnit : null;
          const kg = stated ?? line.weightKg;
          perUnit = quote.price * kg;
          flags.push(stated ? "kg_converted_stated_weight" : "kg_converted_nominal_weight");
          note = `${quote.price}/kg × ${kg} kg`;
        }
        break;
      }
      case "same_as_last_year":
        perUnit = line.lastPaidInr;
        flags.push("baseline_from_buyer_history");
        note = `Buyer's last-paid price ₹${line.lastPaidInr}`;
        break;
      default:
        excluded = true;
        note = quote.basisNote ?? "Unrecognised price basis";
    }

    // 2) currency → INR at the buyer's editable rate
    if (perUnit != null && quote.basis !== "same_as_last_year") {
      const cur = quote.currency.toUpperCase();
      if (cur === "INR") unitInr = perUnit;
      else if (cur === "USD") {
        unitInr = perUnit * session.fxUsdInr;
        flags.push("usd_converted");
        note = `${note ? note + "; " : ""}USD at ₹${session.fxUsdInr}/$ (buyer assumption)`;
      } else {
        excluded = true;
        flags.push("unsupported_currency");
        note = `Currency ${quote.currency} not supported`;
      }
    } else if (perUnit != null) {
      unitInr = perUnit;
    }

    // 3) discounts
    let netInr = unitInr;
    let netCond = unitInr;
    if (unitInr != null) {
      for (const d of unconditional) {
        netInr = (netInr as number) * (1 - (d.percent as number) / 100);
        flags.push("discount_applied");
      }
      netCond = netInr;
      for (const d of conditional) {
        netCond = (netCond as number) * (1 - (d.percent as number) / 100);
        flags.push("conditional_discount_available");
      }
    }

    // 4) sanity: a price wildly off the buyer's own history is usually a unit mistake
    if (unitInr != null && quote.basis !== "same_as_last_year") {
      const ratio = unitInr / line.lastPaidInr;
      if (ratio < 0.5 || ratio > 1.9) flags.push("price_outlier");
    }

    // 5) confidence only ever goes down
    let confidence = Math.max(0, Math.min(1, quote.confidence));
    for (const f of flags) {
      const cap = CAPS[f];
      if (cap != null) confidence = Math.min(confidence, cap);
    }
    if (confidence < 0.8) flags.push("low_confidence");

    const uniqueFlags = [...new Set(flags)];
    let status: NormalizedCell["status"] = excluded
      ? "excluded"
      : uniqueFlags.some((f) => BLOCKING_FLAGS.includes(f))
        ? "review"
        : "ok";

    let finalUnit = unitInr;
    let finalNet = netInr;
    let finalCond = netCond;
    if (buyer && !excluded) {
      status = "confirmed";
      if (buyer.action === "overridden" && buyer.price != null) {
        finalUnit = finalNet = finalCond = buyer.price;
      }
    }

    cells.push({
      lineId: line.lineId,
      vendorId: vendor.vendorId,
      status,
      quoted: { price: quote.price, currency: quote.currency, basis: quote.basis },
      unitInr: finalUnit == null ? null : round(finalUnit),
      netInr: finalNet == null ? null : round(finalNet),
      netIfConditionalInr: finalCond == null ? null : round(finalCond),
      confidence: round(buyer ? 1 : confidence, 2),
      flags: uniqueFlags,
      evidence: quote.evidence,
      location: quote.location,
      interpretation: quote.interpretation ?? quote.specDeviation,
      note,
      buyer,
    });
  }
  return cells;
}

export function rebuildNormalized(session: DemoSession): NormalizedCell[] {
  return session.vendors.flatMap((v) => normalizeVendor(session, v));
}

export function cellFor(session: DemoSession, vendorId: string, lineId: string): NormalizedCell | undefined {
  return session.normalized.find((c) => c.vendorId === vendorId && c.lineId === lineId);
}

/** The price the award engine uses for a cell. */
export function effectivePrice(cell: NormalizedCell, applyConditionalDiscounts: boolean): number | null {
  if (cell.status === "missing" || cell.status === "excluded") return null;
  return applyConditionalDiscounts ? cell.netIfConditionalInr : cell.netInr;
}

export function lineById(session: DemoSession, lineId: string): RfxLine | undefined {
  return session.lines.find((l) => l.lineId === lineId);
}
