import type Anthropic from "@anthropic-ai/sdk";
import type { DemoSession } from "../types";
import { runToolLoop, type ToolDef, type TraceStep } from "../llm";
import { computeAward, compareVendors, type AwardOptions } from "../award";
import { allGates } from "../qualify";
import { effectivePrice, FLAG_LABELS } from "../normalize";

export type AnalystBlock =
  | { kind: "text"; markdown: string; tone?: "info" | "warning"; unverifiedFigures?: string[] }
  | { kind: "table"; title: string; columns: string[]; rows: string[][] }
  | { kind: "chart"; title: string; points: { label: string; value: number }[]; format: "inr" | "int" | "pct" };

export type AnalystAnswer = {
  blocks: AnalystBlock[];
  trace: TraceStep[];
  usage: { input: number; output: number };
  incomplete?: string;
};

const fmtInr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtInr2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function getPath(obj: unknown, p: string): unknown {
  return p.split(".").reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj);
}

function fmtCell(v: unknown, format?: string): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.map((x) => fmtCell(x)).join(", ") || "—";
  if (typeof v === "number") {
    if (format === "inr") return fmtInr(v);
    if (format === "inr2") return fmtInr2(v);
    if (format === "pct") return `${v}%`;
    if (format === "int") return Math.round(v).toLocaleString("en-IN");
    return String(v);
  }
  return String(v);
}

function collectNumbers(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectNumbers(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectNumbers(x, out));
  return out;
}

/** Every figure in the model's prose must trace back to a tool result. Anything else is flagged. */
function unverifiedFigures(text: string, known: number[]): string[] {
  const bag = new Set<number>();
  for (const k of known) {
    bag.add(k);
    bag.add(Math.round(k * 100) / 100);
    bag.add(Math.round(k * 10) / 10);
    bag.add(k / 1e5);
    bag.add(k / 1e7);
  }
  const arr = [...bag];
  const bad: string[] = [];
  for (const m of text.matchAll(/(?<![A-Za-z_-])(\d[\d,]*(?:\.\d+)?)/g)) {
    const raw = m[1];
    const n = parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 10) continue; // small counts / ordinals are not "figures"
    if (n >= 1990 && n <= 2100 && !raw.includes(",")) continue; // years
    const ok = arr.some((k) => Math.abs(k - n) <= Math.max(0.51, Math.abs(k) * 0.006));
    if (!ok) bad.push(raw);
  }
  return [...new Set(bad)];
}

const SYSTEM = `You are the analyst inside a procurement tool. The buyer is looking at a comparison of vendor quotes that were extracted from messy files. They may be about to commit crores of rupees on your answer.

How you work:
- NEVER do arithmetic or recall numbers yourself. Call tools; quote only numbers they return. Any figure in your prose that is not in a tool result will be flagged to the buyer as unverified.
- Show tables and charts by referencing a tool result in \`present\` (resultId + path + columns). Do not retype table rows.
- Be a skeptical analyst, not a cheerleader. Always surface what could make the answer wrong: lines nobody quoted, cells that rest on unconfirmed interpretations (status "review"), vendors whose questionnaire answers conflict with their own attached certificates, quotes that are not like-for-like (freight extra, FOB/EXW, conditional discounts, different coverage).
- Rank vendors only on like-for-like totals (compare_vendors → likeForLikeTotalInr). A vendor that skipped lines looks artificially cheap on raw totals.
- Say what you excluded and why. If a result depends on an assumption the buyer can change (exchange rate, conditional discounts, treating unconfirmed cells as valid), say so and offer the variant.
- If the data cannot answer the question, say so plainly. Never guess.
- Money is INR. Use Indian grouping in prose (₹1,23,456) and prefer lakh/crore for big totals only when the tool returned that figure.
- Finish every turn by calling \`present\` once, with a short headline first, then the evidence (tables/charts), then caveats and a recommendation or the next question worth asking. Keep it tight.`;

const tools: ToolDef[] = [
  {
    name: "get_overview",
    description: "Overview of the RFx, vendors (coverage, quality-gate status, commercial terms), assumptions, and counts of cells needing buyer review. Call first when unsure.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_prices",
    description: "Normalized INR/unit prices per (line, vendor) with status, confidence, flags and source evidence. Filter by lineIds and/or vendorIds (max 150 rows).",
    input_schema: {
      type: "object",
      properties: {
        lineIds: { type: "array", items: { type: "string" } },
        vendorIds: { type: "array", items: { type: "string" } },
        onlyStatus: { type: "array", items: { type: "string", enum: ["ok", "review", "confirmed", "missing", "excluded"] } },
      },
    },
  },
  {
    name: "compare_vendors",
    description: "Per-vendor totals, coverage, like-for-like total (lines all compared vendors quoted), unconfirmed exposure, terms and quality gate.",
    input_schema: {
      type: "object",
      properties: {
        vendorIds: { type: "array", items: { type: "string" } },
        applyConditionalDiscounts: { type: "boolean", description: "Scenario: assume conditional discounts are earned." },
      },
    },
  },
  {
    name: "compute_award",
    description:
      "Deterministic award engine. strategy=split → cheapest eligible vendor per line; strategy=single → every line to singleVendorId. Supports quality filtering, vendor caps (best subset), excluding unconfirmed cells, conditional-discount scenario. Returns allocations, total, coverage, exposure, caveats.",
    input_schema: {
      type: "object",
      properties: {
        strategy: { type: "string", enum: ["split", "single"] },
        singleVendorId: { type: "string" },
        vendorIds: { type: "array", items: { type: "string" } },
        qualifiedOnly: { type: "boolean", description: "Only vendors whose questionnaire gate is 'cleared'." },
        includeConflicts: { type: "boolean" },
        includeUnverified: { type: "boolean" },
        excludeReviewCells: { type: "boolean" },
        applyConditionalDiscounts: { type: "boolean" },
        maxVendors: { type: "integer" },
        lineIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "get_questionnaire_results",
    description: "Per-vendor, per-question verdicts (pass/fail/unknown/conflict) with evidence, plus attached-document facts (e.g. expiry dates).",
    input_schema: { type: "object", properties: { vendorIds: { type: "array", items: { type: "string" } } } },
  },
  {
    name: "list_review_cells",
    description: "Cells flagged for buyer review (unconfirmed interpretations, low confidence, outliers) with the reason and evidence.",
    input_schema: { type: "object", properties: { vendorIds: { type: "array", items: { type: "string" } } } },
  },
  {
    name: "present",
    description:
      "Render the final answer to the buyer. blocks is an ordered list. text: {type:'text', markdown, tone?}. table: {type:'table', title, resultId, path, columns:[{key,label,format?}], limit?} where resultId/path point into an earlier tool result (path is a dot-path to an array of objects, e.g. 'allocations'); format ∈ inr|inr2|pct|int|text. chart: {type:'chart', title, resultId, path, labelKey, valueKey, format?}. Call exactly once, last.",
    input_schema: {
      type: "object",
      properties: {
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["text", "table", "chart"] },
              markdown: { type: "string" },
              tone: { type: "string", enum: ["info", "warning"] },
              title: { type: "string" },
              resultId: { type: "string" },
              path: { type: "string" },
              columns: {
                type: "array",
                items: {
                  type: "object",
                  properties: { key: { type: "string" }, label: { type: "string" }, format: { type: "string" } },
                  required: ["key", "label"],
                },
              },
              limit: { type: "integer" },
              labelKey: { type: "string" },
              valueKey: { type: "string" },
              format: { type: "string" },
            },
            required: ["type"],
          },
        },
      },
      required: ["blocks"],
    },
  },
];

export async function askAnalyst(session: DemoSession, question: string): Promise<AnalystAnswer> {
  const results = new Map<string, unknown>();
  let counter = 0;
  const store = (v: unknown) => {
    const id = `r${++counter}`;
    results.set(id, v);
    return { resultId: id, ...(v as object) };
  };
  const gates = allGates(session);
  const nameOf = (id: string) => session.vendors.find((v) => v.vendorId === id)?.vendorName ?? id;
  let presented: AnalystBlock[] | null = null;

  const handlers: Record<string, (i: Record<string, unknown>) => unknown> = {
    get_overview: () =>
      store({
        rfx: { id: session.rfx.rfxId, title: session.rfx.title, lines: session.lines.length, annualSpendAtTargetInr: Math.round(session.lines.reduce((a, l) => a + l.qty * l.targetInrPerBox, 0)) },
        assumptions: { usdInrRate: session.fxUsdInr, note: "Buyer-editable. Conditional discounts are NOT applied unless asked." },
        vendors: session.vendors.map((v) => {
          const g = gates.find((x) => x.vendorId === v.vendorId)!;
          const cells = session.normalized.filter((c) => c.vendorId === v.vendorId);
          return {
            vendorId: v.vendorId,
            vendorName: v.vendorName,
            files: v.files.map((f) => f.name),
            linesQuoted: cells.filter((c) => c.status !== "missing" && c.status !== "excluded").length,
            linesMissing: cells.filter((c) => c.status === "missing").length,
            cellsNeedingReview: cells.filter((c) => c.status === "review").length,
            qualityGate: g.status,
            gateReasons: g.reasons,
            terms: v.extraction.terms,
            notes: v.extraction.notes,
          };
        }),
      }),
    get_prices: (i) => {
      const lineIds = i.lineIds as string[] | undefined;
      const vendorIds = i.vendorIds as string[] | undefined;
      const only = i.onlyStatus as string[] | undefined;
      const rows = session.normalized
        .filter((c) => (!lineIds || lineIds.includes(c.lineId)) && (!vendorIds || vendorIds.includes(c.vendorId)) && (!only || only.includes(c.status)))
        .slice(0, 150)
        .map((c) => ({
          lineId: c.lineId,
          sku: session.lines.find((l) => l.lineId === c.lineId)?.sku,
          vendorId: c.vendorId,
          vendorName: nameOf(c.vendorId),
          netInrPerUnit: effectivePrice(c, false),
          status: c.status,
          confidence: c.confidence,
          flags: c.flags.map((f) => FLAG_LABELS[f]),
          evidence: c.evidence.slice(0, 140),
          note: c.note,
        }));
      return store({ rows, truncatedAt150: rows.length === 150 });
    },
    compare_vendors: (i) => store(compareVendors(session, i as { vendorIds?: string[]; applyConditionalDiscounts?: boolean })),
    compute_award: (i) => store(computeAward(session, i as AwardOptions)),
    get_questionnaire_results: (i) => {
      const ids = i.vendorIds as string[] | undefined;
      return store({
        vendors: gates
          .filter((g) => !ids || ids.includes(g.vendorId))
          .map((g) => ({
            vendorId: g.vendorId,
            vendorName: nameOf(g.vendorId),
            status: g.status,
            questions: g.questions,
            documents: session.vendors.find((v) => v.vendorId === g.vendorId)?.extraction.documents ?? [],
          })),
        rows: gates
          .filter((g) => !ids || ids.includes(g.vendorId))
          .flatMap((g) => g.questions.map((q) => ({ vendor: nameOf(g.vendorId), question: q.text.split("(")[0].trim(), answer: q.answer, verdict: q.verdict, note: q.note ?? "" }))),
      });
    },
    list_review_cells: (i) => {
      const ids = i.vendorIds as string[] | undefined;
      const rows = session.normalized
        .filter((c) => c.status === "review" && (!ids || ids.includes(c.vendorId)))
        .map((c) => ({
          lineId: c.lineId,
          vendor: nameOf(c.vendorId),
          netInrPerUnit: c.netInr,
          confidence: c.confidence,
          why: c.flags.filter((f) => f !== "low_confidence").map((f) => FLAG_LABELS[f]),
          interpretation: c.interpretation ?? "",
        }));
      return store({ count: rows.length, rows: rows.slice(0, 120) });
    },
    present: (i) => {
      const raw = (i.blocks as Record<string, unknown>[]) ?? [];
      const out: AnalystBlock[] = [];
      for (const b of raw) {
        if (b.type === "text") out.push({ kind: "text", markdown: String(b.markdown ?? ""), tone: b.tone as "info" | "warning" | undefined });
        else if (b.type === "table") {
          const src = results.get(String(b.resultId));
          const arr = src == null ? null : getPath(src, String(b.path));
          if (!Array.isArray(arr)) throw new Error(`table block: ${b.resultId}/${b.path} is not an array of rows`);
          const cols = (b.columns as { key: string; label: string; format?: string }[]) ?? [];
          const limit = Number(b.limit ?? 60);
          out.push({
            kind: "table",
            title: String(b.title ?? ""),
            columns: cols.map((c) => c.label),
            rows: arr.slice(0, limit).map((row) => cols.map((c) => fmtCell(getPath(row, c.key), c.format))),
          });
        } else if (b.type === "chart") {
          const src = results.get(String(b.resultId));
          const arr = src == null ? null : getPath(src, String(b.path));
          if (!Array.isArray(arr)) throw new Error(`chart block: ${b.resultId}/${b.path} is not an array`);
          out.push({
            kind: "chart",
            title: String(b.title ?? ""),
            format: (b.format as "inr" | "int" | "pct") ?? "inr",
            points: arr.map((row) => ({ label: String(getPath(row, String(b.labelKey))), value: Number(getPath(row, String(b.valueKey))) })).filter((p) => Number.isFinite(p.value)),
          });
        }
      }
      if (out.length === 0) throw new Error("present: no valid blocks");
      presented = out;
      return "ok";
    },
  };

  const history: Anthropic.MessageParam[] = session.analystTranscript.slice(-8).map((t) => ({ role: t.role, content: t.text }));
  const loop = await runToolLoop({
    system: SYSTEM,
    messages: [...history, { role: "user", content: question }],
    tools,
    handlers,
    terminalTools: ["present"],
    maxTurns: 10,
  });

  let blocks: AnalystBlock[] = presented ?? [];
  let incomplete: string | undefined;
  if (blocks.length === 0) {
    blocks = [{ kind: "text", markdown: loop.finalText || "I could not produce an answer." }];
    incomplete = loop.stoppedBy === "max_turns" ? "The analyst ran out of steps before presenting." : "The analyst answered in plain text without structured evidence.";
  }

  // Verify every figure in prose against the tool results.
  const known = [...results.values()].flatMap((r) => collectNumbers(r));
  blocks = blocks.map((b) => {
    if (b.kind !== "text") return b;
    const bad = unverifiedFigures(b.markdown, known);
    return bad.length ? { ...b, unverifiedFigures: bad } : b;
  });

  const summary = blocks
    .map((b) => (b.kind === "text" ? b.markdown : b.kind === "table" ? `[table: ${b.title}]` : `[chart: ${b.title}]`))
    .join("\n");
  session.analystTranscript.push({ role: "user", text: question }, { role: "assistant", text: summary });
  return { blocks, trace: loop.trace, usage: loop.usage, incomplete };
}
