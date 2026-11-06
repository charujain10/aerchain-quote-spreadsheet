import type { DemoSession, NormalizedCell } from "./types";
import { cellFor, effectivePrice } from "./normalize";
import { allGates } from "./qualify";

export type AwardOptions = {
  /** "split": cheapest eligible vendor per line. "single": every line to one vendor. */
  strategy?: "split" | "single";
  singleVendorId?: string;
  /** Restrict to these vendors (default: all). */
  vendorIds?: string[];
  /** Only vendors whose questionnaire gate is "cleared". */
  qualifiedOnly?: boolean;
  /** Also admit vendors whose answers conflict with their attached evidence. */
  includeConflicts?: boolean;
  /** Also admit vendors with unanswered questions. */
  includeUnverified?: boolean;
  /** Ignore cells still waiting for buyer confirmation. */
  excludeReviewCells?: boolean;
  /** Scenario: assume conditional (e.g. volume) discounts are earned. */
  applyConditionalDiscounts?: boolean;
  /** Use the best subset of at most N vendors. */
  maxVendors?: number;
  lineIds?: string[];
};

export type Allocation = {
  lineId: string;
  sku: string;
  vendorId: string;
  vendorName: string;
  qty: number;
  unitPriceInr: number;
  spendInr: number;
  cellStatus: NormalizedCell["status"];
  runnerUpVendor?: string;
  savingVsRunnerUpInr?: number;
};

export type AwardResult = {
  options: AwardOptions;
  allocations: Allocation[];
  totalInr: number;
  coverage: { linesAwarded: number; linesTotal: number; uncoveredLineIds: string[] };
  spendOnUnconfirmedCellsInr: number;
  unconfirmedCellCount: number;
  eligibleVendors: string[];
  excludedVendors: { vendorId: string; vendorName: string; reason: string }[];
  spendByVendor: { vendorId: string; vendorName: string; lines: number; spendInr: number; sharePct: number }[];
  /** Same lines awarded at the buyer's target price, for context only. */
  targetSpendOnAwardedLinesInr: number;
  vsTargetPct: number | null;
  caveats: string[];
};

const nameOf = (s: DemoSession, id: string) => s.vendors.find((v) => v.vendorId === id)?.vendorName ?? id;

function eligibleVendors(s: DemoSession, o: AwardOptions) {
  const gates = new Map(allGates(s).map((g) => [g.vendorId, g]));
  const excluded: AwardResult["excludedVendors"] = [];
  const ids: string[] = [];
  for (const v of s.vendors) {
    if (o.vendorIds && !o.vendorIds.includes(v.vendorId)) {
      excluded.push({ vendorId: v.vendorId, vendorName: v.vendorName, reason: "not selected" });
      continue;
    }
    const gate = gates.get(v.vendorId)!;
    if (o.qualifiedOnly) {
      const ok =
        gate.status === "cleared" ||
        (gate.status === "conflict" && o.includeConflicts) ||
        (gate.status === "unverified" && o.includeUnverified);
      if (!ok) {
        excluded.push({
          vendorId: v.vendorId,
          vendorName: v.vendorName,
          reason: `quality gate ${gate.status}: ${gate.reasons.join("; ") || "n/a"}`,
        });
        continue;
      }
    }
    ids.push(v.vendorId);
  }
  return { ids, excluded };
}

function splitFor(s: DemoSession, vendorIds: string[], o: AwardOptions) {
  const allocations: Allocation[] = [];
  const uncovered: string[] = [];
  const lines = o.lineIds ? s.lines.filter((l) => o.lineIds!.includes(l.lineId)) : s.lines;
  for (const line of lines) {
    const cands = vendorIds
      .map((vid) => ({ vid, cell: cellFor(s, vid, line.lineId) }))
      .filter((c): c is { vid: string; cell: NormalizedCell } => !!c.cell)
      .filter((c) => !(o.excludeReviewCells && c.cell.status === "review"))
      .map((c) => ({ ...c, price: effectivePrice(c.cell, !!o.applyConditionalDiscounts) }))
      .filter((c): c is typeof c & { price: number } => c.price != null)
      .sort((a, b) => a.price - b.price);
    if (cands.length === 0) {
      uncovered.push(line.lineId);
      continue;
    }
    const best = cands[0];
    const second = cands[1];
    allocations.push({
      lineId: line.lineId,
      sku: line.sku,
      vendorId: best.vid,
      vendorName: nameOf(s, best.vid),
      qty: line.qty,
      unitPriceInr: best.price,
      spendInr: best.price * line.qty,
      cellStatus: best.cell.status,
      runnerUpVendor: second ? nameOf(s, second.vid) : undefined,
      savingVsRunnerUpInr: second ? (second.price - best.price) * line.qty : undefined,
    });
  }
  return { allocations, uncovered };
}

function subsets<T>(arr: T[], max: number): T[][] {
  const out: T[][] = [];
  const n = arr.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const sub = arr.filter((_, i) => mask & (1 << i));
    if (sub.length <= max) out.push(sub);
  }
  return out;
}

export function computeAward(s: DemoSession, o: AwardOptions = {}): AwardResult {
  const strategy = o.strategy ?? "split";
  const { ids, excluded } = eligibleVendors(s, o);
  const caveats: string[] = [];
  let pool = ids;

  if (strategy === "single") {
    const only = o.singleVendorId;
    pool = only && ids.includes(only) ? [only] : [];
    if (only && !ids.includes(only)) caveats.push(`Vendor ${only} is not eligible under the chosen filters.`);
  } else if (o.maxVendors && o.maxVendors < pool.length) {
    // Exhaustive search over vendor subsets: maximise coverage first, then minimise spend.
    let best: { sub: string[]; covered: number; total: number } | null = null;
    for (const sub of subsets(pool, o.maxVendors)) {
      const r = splitFor(s, sub, o);
      const total = r.allocations.reduce((a, x) => a + x.spendInr, 0);
      const covered = r.allocations.length;
      if (!best || covered > best.covered || (covered === best.covered && total < best.total)) {
        best = { sub, covered, total };
      }
    }
    if (best) pool = best.sub;
    caveats.push(`Best ${o.maxVendors}-vendor combination chosen by exhaustive search: ${pool.map((p) => nameOf(s, p)).join(", ")}.`);
  }

  const { allocations, uncovered } = splitFor(s, pool, o);
  const totalInr = allocations.reduce((a, x) => a + x.spendInr, 0);
  const unconfirmed = allocations.filter((a) => a.cellStatus === "review");
  const spendOnUnconfirmed = unconfirmed.reduce((a, x) => a + x.spendInr, 0);

  const byVendor = new Map<string, { lines: number; spend: number }>();
  for (const a of allocations) {
    const cur = byVendor.get(a.vendorId) ?? { lines: 0, spend: 0 };
    cur.lines++;
    cur.spend += a.spendInr;
    byVendor.set(a.vendorId, cur);
  }

  const targetSpend = allocations.reduce((acc, a) => {
    const line = s.lines.find((l) => l.lineId === a.lineId);
    return acc + (line ? line.targetInrPerBox * line.qty : 0);
  }, 0);

  if (uncovered.length) caveats.push(`${uncovered.length} line(s) have no eligible quote and are NOT in the total: ${uncovered.join(", ")}.`);
  if (unconfirmed.length)
    caveats.push(
      `${unconfirmed.length} awarded cell(s) (₹${Math.round(spendOnUnconfirmed).toLocaleString("en-IN")}) rest on interpretations the buyer has not confirmed.`
    );
  const globalLike = s.vendors.filter((v) => pool.includes(v.vendorId) && /fob|exw|fca|cif|cfr/i.test(v.extraction.terms.incoterm ?? ""));
  for (const v of globalLike)
    caveats.push(`${v.vendorName} quoted ${v.extraction.terms.incoterm}: freight, duty and clearance to the delivery location are not in its price.`);
  const freightExtra = s.vendors.filter((v) => pool.includes(v.vendorId) && v.extraction.terms.freight === "extra");
  for (const v of freightExtra) caveats.push(`${v.vendorName}: freight is extra (not in unit prices).`);

  return {
    options: o,
    allocations,
    totalInr: Math.round(totalInr),
    coverage: { linesAwarded: allocations.length, linesTotal: o.lineIds?.length ?? s.lines.length, uncoveredLineIds: uncovered },
    spendOnUnconfirmedCellsInr: Math.round(spendOnUnconfirmed),
    unconfirmedCellCount: unconfirmed.length,
    eligibleVendors: pool,
    excludedVendors: excluded,
    spendByVendor: [...byVendor.entries()].map(([vid, v]) => ({
      vendorId: vid,
      vendorName: nameOf(s, vid),
      lines: v.lines,
      spendInr: Math.round(v.spend),
      sharePct: totalInr ? Math.round((v.spend / totalInr) * 1000) / 10 : 0,
    })),
    targetSpendOnAwardedLinesInr: Math.round(targetSpend),
    vsTargetPct: targetSpend ? Math.round(((totalInr - targetSpend) / targetSpend) * 1000) / 10 : null,
    caveats,
  };
}

export type VendorComparison = {
  vendorId: string;
  vendorName: string;
  gate: string;
  linesQuoted: number;
  linesTotal: number;
  missingLineIds: string[];
  totalOnQuotedLinesInr: number;
  /** Total over only those lines EVERY compared vendor quoted: the only fair ranking. */
  likeForLikeTotalInr: number;
  spendOnUnconfirmedCellsInr: number;
  incoterm?: string;
  freight: string;
  paymentTerms?: string;
  conditionalDiscountSavingInr: number;
};

export function compareVendors(
  s: DemoSession,
  opts: { vendorIds?: string[]; applyConditionalDiscounts?: boolean } = {}
): { vendors: VendorComparison[]; commonLines: number; note: string } {
  const gates = new Map(allGates(s).map((g) => [g.vendorId, g]));
  const vendors = s.vendors.filter((v) => !opts.vendorIds || opts.vendorIds.includes(v.vendorId));
  const cond = !!opts.applyConditionalDiscounts;
  const quotedLines = (vid: string) =>
    new Set(s.lines.filter((l) => {
      const c = cellFor(s, vid, l.lineId);
      return c && effectivePrice(c, cond) != null;
    }).map((l) => l.lineId));
  const common = s.lines.filter((l) => vendors.every((v) => quotedLines(v.vendorId).has(l.lineId)));

  const rows = vendors.map((v) => {
    let total = 0, like = 0, unconf = 0, condSaving = 0, quoted = 0;
    const missing: string[] = [];
    for (const l of s.lines) {
      const c = cellFor(s, v.vendorId, l.lineId);
      const p = c ? effectivePrice(c, cond) : null;
      if (!c || p == null) { missing.push(l.lineId); continue; }
      quoted++;
      total += p * l.qty;
      if (c.status === "review") unconf += p * l.qty;
      if (c.netInr != null && c.netIfConditionalInr != null) condSaving += (c.netInr - c.netIfConditionalInr) * l.qty;
      if (common.some((cl) => cl.lineId === l.lineId)) like += p * l.qty;
    }
    return {
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      gate: gates.get(v.vendorId)?.status ?? "unknown",
      linesQuoted: quoted,
      linesTotal: s.lines.length,
      missingLineIds: missing,
      totalOnQuotedLinesInr: Math.round(total),
      likeForLikeTotalInr: Math.round(like),
      spendOnUnconfirmedCellsInr: Math.round(unconf),
      incoterm: v.extraction.terms.incoterm,
      freight: v.extraction.terms.freight,
      paymentTerms: v.extraction.terms.paymentTerms,
      conditionalDiscountSavingInr: Math.round(condSaving),
    };
  });
  return {
    vendors: rows.sort((a, b) => a.likeForLikeTotalInr - b.likeForLikeTotalInr),
    commonLines: common.length,
    note: `Rank on likeForLikeTotalInr (${common.length} lines every compared vendor quoted). totalOnQuotedLinesInr is NOT comparable across vendors with different coverage.`,
  };
}
