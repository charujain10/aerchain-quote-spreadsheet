"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionView } from "@/lib/view";
import type { AnalystAnswer, AnalystBlock } from "@/lib/analyst/agent";
import type { Flag, NormalizedCell } from "@/lib/types";
import { FLAG_LABELS } from "@/lib/normalize";

type Step = "rfx" | "send" | "inbox" | "compare" | "analyst";
type TraceStep = { tool: string; input: Record<string, unknown>; summary: string; ok: boolean };
type InboxEntry = { id: string; name: string; received: string; subject: string; note: string; files: { file: string; role: string }[] };
type EvalResult = {
  rows: { vendorId: string; truthCells: number; correct: number; wrongFlagged: number; wrongSilent: number; notExtracted: number; missingDetected: string; gate: { expected: string; actual: string; ok: boolean }; wrongSilentLines: string[] }[];
  totals: { cells: number; correct: number; wrongFlagged: number; wrongSilent: number; accuracyPct: number };
};

const STEPS: { id: Step; label: string }[] = [
  { id: "rfx", label: "1 · RFx co-pilot" },
  { id: "send", label: "2 · Send" },
  { id: "inbox", label: "3 · Read replies" },
  { id: "compare", label: "4 · Compare" },
  { id: "analyst", label: "5 · Ask" },
];

const STARTERS = {
  copilot:
    "I need an RFx for corrugated packaging for our Bangalore DC covering everything in the item master. Payment 45 days, delivered. Vendors must show ISO 9001, BRCGS, a moisture test report, and a last audit score of at least 80. They will reply in messy formats, so don't force a template.",
  analyst: [
    "Which vendors can I actually award to, and what's wrong with the rest?",
    "What if we split it: cheapest per line, but only among vendors who cleared the quality questionnaire?",
    "Rank the vendors fairly. Who is really cheapest, accounting for missing lines and freight?",
    "How much of that split award rests on numbers I haven't confirmed yet?",
    "What if we limit it to two vendors?",
  ],
};

const inr = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

const STATUS_STYLE: Record<NormalizedCell["status"], string> = {
  ok: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900",
  review: "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800",
  confirmed: "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900",
  missing: "bg-zinc-50 dark:bg-zinc-900 border-dashed border-zinc-300 dark:border-zinc-700",
  excluded: "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900",
};
const STATUS_LABEL: Record<NormalizedCell["status"], string> = {
  ok: "Looks right",
  review: "Check me",
  confirmed: "Buyer confirmed",
  missing: "Not quoted",
  excluded: "Excluded",
};
const GATE_STYLE: Record<string, string> = {
  cleared: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  failed: "bg-rose-500/15 text-rose-800 dark:text-rose-200",
  conflict: "bg-amber-500/20 text-amber-900 dark:text-amber-100",
  unverified: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};

async function api<T>(url: string, body?: unknown, form?: FormData): Promise<T> {
  const res = await fetch(url, form ? { method: "POST", body: form } : body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const card = "rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm";
const btn = "px-4 py-2 rounded-lg text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed";
const btnGhost = "px-3 py-1.5 rounded-lg text-xs border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800";

export default function DemoApp() {
  const [s, setS] = useState<SessionView | null>(null);
  const [step, setStep] = useState<Step>("rfx");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => setS(await api<SessionView>("/api/session")), []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);

  const run = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!s) return <div className="min-h-screen grid place-items-center text-zinc-500">{error ?? "Loading…"}</div>;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-teal-700 dark:text-teal-400 font-semibold">Aerchain take-home</p>
            <h1 className="text-lg font-semibold leading-tight">Kill the Quote Spreadsheet</h1>
          </div>
          <nav className="flex gap-1.5 flex-wrap">
            {STEPS.map((x) => (
              <button key={x.id} onClick={() => setStep(x.id)} className={`px-3 py-1.5 rounded-full text-sm border transition ${step === x.id ? "bg-teal-700 text-white border-teal-700" : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                {x.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-1 rounded-full ${s.llm.configured ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-rose-500/15 text-rose-800 dark:text-rose-200"}`}>
              {s.llm.configured ? `Live model · ${s.llm.provider} · ${s.llm.model}` : "No API key"}
            </span>
            <button className={btnGhost} onClick={() => run("reset", async () => setS(await api<SessionView>("/api/session/reset", {})))}>
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {!s.llm.configured && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 text-sm">
            <b>No model API key is set.</b> There is deliberately no fake mode: the co-pilot, the reading of vendor replies and the analyst all call a real model. Put <code>GEMINI_API_KEY</code> (free at aistudio.google.com) or <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> and restart <code>npm run dev</code>.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 text-sm flex justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs underline">dismiss</button>
          </div>
        )}
        {step === "rfx" && <CoPilot s={s} setS={setS} run={run} busy={busy} next={() => setStep("send")} />}
        {step === "send" && <Send s={s} setS={setS} run={run} busy={busy} next={() => setStep("inbox")} />}
        {step === "inbox" && <Inbox s={s} setS={setS} run={run} busy={busy} next={() => setStep("compare")} />}
        {step === "compare" && <Compare s={s} setS={setS} run={run} busy={busy} />}
        {step === "analyst" && <Analyst s={s} setS={setS} run={run} busy={busy} />}
      </main>
    </div>
  );
}

type Run = <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined>;
type P = { s: SessionView; setS: (s: SessionView) => void; run: Run; busy: string | null };

// ───────────────────────────── 1. Co-pilot ─────────────────────────────

function CoPilot({ s, setS, run, busy, next }: P & { next: () => void }) {
  const [text, setText] = useState("");
  const [traces, setTraces] = useState<TraceStep[][]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [s.copilotTranscript.length, busy]);

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setText("");
    const r = await run("copilot", () => api<{ reply: { trace: TraceStep[] }; session: SessionView }>("/api/copilot", { message: msg }));
    if (r) {
      setS(r.session);
      setTraces((t) => [...t, r.reply.trace]);
    }
  };
  const ready = s.lines.length > 0 && s.rfx.questionnaire.length > 0 && !!s.rfx.email;

  return (
    <section className="grid lg:grid-cols-2 gap-4">
      <div className={`${card} p-4 flex flex-col h-[640px]`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Talk the RFx into existence</h2>
          <button className="text-xs underline text-zinc-500" disabled={!!busy} onClick={() => run("template", async () => setS(await api<SessionView>("/api/rfx/quickstart", {})))} title="Fills the RFx from a fixed template with no model call. Everything after this step is still real.">
            skip: use template
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 text-sm pr-1">
          {s.copilotTranscript.length === 0 && <p className="text-zinc-500">Describe what you need. The co-pilot will pull lines from your item master, propose a quality gate and terms, and write the vendor email — by calling tools that edit the draft on the right.</p>}
          {s.copilotTranscript.map((t, i) => (
            <div key={i} className={`rounded-lg p-3 ${t.role === "user" ? "bg-zinc-100 dark:bg-zinc-800" : "bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900"}`}>
              <span className="text-[10px] font-semibold uppercase text-zinc-500">{t.role === "user" ? "You" : "Co-pilot"}</span>
              <Md text={t.text} />
              {t.role === "assistant" && traces[(i - 1) / 2] && <Trace steps={traces[(i - 1) / 2]} />}
            </div>
          ))}
          {busy === "copilot" && <p className="text-zinc-500 animate-pulse">Co-pilot is working…</p>}
          <div ref={endRef} />
        </div>
        {s.copilotTranscript.length === 0 && (
          <button className="text-left text-xs text-teal-800 dark:text-teal-300 hover:underline mt-2" onClick={() => setText(STARTERS.copilot)}>
            Use a starter prompt →
          </button>
        )}
        <form className="flex gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Tell the co-pilot what you need…" className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className={btn} disabled={!!busy || !text.trim()}>Send</button>
        </form>
      </div>

      <div className={`${card} p-4 h-[640px] overflow-auto`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{s.rfx.rfxId}{s.rfx.title ? ` · ${s.rfx.title}` : ""}</h2>
          <button className={btn} disabled={!ready} onClick={next}>Review & send →</button>
        </div>
        <p className="text-xs text-zinc-500 mt-1">Live draft — only what the co-pilot has set through its tools appears here.</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-3">
          <dt className="text-zinc-500">Delivery</dt><dd>{s.rfx.terms.deliveryLocation || "—"}</dd>
          <dt className="text-zinc-500">Payment</dt><dd>{s.rfx.terms.paymentDays} days · {s.rfx.terms.incoterm}</dd>
          <dt className="text-zinc-500">Validity</dt><dd>{s.rfx.terms.validityDays} days</dd>
          <dt className="text-zinc-500">Annual spend at target</dt><dd>{s.lines.length ? inr(s.lines.reduce((a, l) => a + l.qty * l.targetInrPerBox, 0), 0) : "—"}</dd>
        </dl>
        <h3 className="text-xs font-semibold mt-4 mb-1">Quality gate ({s.rfx.questionnaire.length})</h3>
        <ul className="text-xs list-disc pl-4 space-y-0.5">
          {s.rfx.questionnaire.map((q) => <li key={q.id}>{q.text}{q.gate.min != null ? ` — min ${q.gate.min}` : ""}{q.gate.required ? "" : " (informational)"}</li>)}
          {s.rfx.questionnaire.length === 0 && <li className="list-none text-zinc-400">not set yet</li>}
        </ul>
        <h3 className="text-xs font-semibold mt-4 mb-1">Lines ({s.lines.length})</h3>
        <table className="w-full text-xs">
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.lineId} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1 pr-2 font-mono">{l.lineId}</td>
                <td className="py-1 pr-2">{l.description}</td>
                <td className="py-1 text-right whitespace-nowrap">{l.qty.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.lines.length === 0 && <p className="text-xs text-zinc-400">no lines yet</p>}
      </div>
    </section>
  );
}

// ───────────────────────────── 2. Send ─────────────────────────────

function Send({ s, setS, run, busy, next }: P & { next: () => void }) {
  if (!s.rfx.email) return <p className="text-sm text-zinc-500">Build the RFx first (step 1).</p>;
  return (
    <section className={`${card} p-5 max-w-3xl`}>
      <h2 className="font-semibold mb-1">Cover email (written by the co-pilot)</h2>
      <p className="text-xs text-zinc-500 mb-3">Channel: email. The SMTP server is stubbed; nothing leaves this machine. Note vendors are told they can reply in any format.</p>
      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4 text-sm space-y-2">
        <p><b>Subject:</b> {s.rfx.email.subject}</p>
        <p className="whitespace-pre-wrap">{s.rfx.email.body}</p>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className={btn} disabled={!!busy || s.rfx.status === "sent"} onClick={async () => { const r = await run("send", () => api<SessionView>("/api/rfx/send", {})); if (r) setS(r); }}>
          {s.rfx.status === "sent" ? "Sent to 5 vendors (simulated)" : "Send to 5 vendors (simulated)"}
        </button>
        {s.rfx.status === "sent" && <button className={btnGhost} onClick={next}>Replies arrive → </button>}
      </div>
    </section>
  );
}

// ───────────────────────────── 3. Inbox / ingestion ─────────────────────────────

function Inbox({ s, setS, run, busy, next }: P & { next: () => void }) {
  const [inbox, setInbox] = useState<InboxEntry[]>([]);
  const [state, setState] = useState<Record<string, "running" | "done" | "error">>({});
  const [uploadName, setUploadName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { api<InboxEntry[]>("/api/inbox").then(setInbox).catch(() => {}); }, []);

  const read = async (id: string) => {
    setState((x) => ({ ...x, [id]: "running" }));
    const r = await run(`ingest:${id}`, () => api<SessionView>("/api/ingest/bundled", { vendorId: id }));
    if (r) { setS(r); setState((x) => ({ ...x, [id]: "done" })); } else setState((x) => ({ ...x, [id]: "error" }));
  };
  const readAll = async () => { for (const e of inbox) if (!s.vendors.some((v) => v.vendorId === e.id)) await read(e.id); };
  const upload = async () => {
    const files = fileRef.current?.files;
    if (!files?.length) return;
    const fd = new FormData();
    fd.set("vendorName", uploadName || "Uploaded vendor");
    [...files].forEach((f) => fd.append("files", f));
    const r = await run("upload", () => api<SessionView>("/api/ingest/upload", undefined, fd));
    if (r) setS(r);
  };

  if (s.lines.length === 0) return <p className="text-sm text-zinc-500">Build the RFx first (step 1).</p>;
  const done = s.vendors.length;

  return (
    <section className="space-y-4">
      <div className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="font-semibold">Vendor replies — nine days, five shapes</h2>
          <p className="text-xs text-zinc-500">Each reply goes to the model as-is (spreadsheet cells, PDF, Word text, the photo itself, email body). No template, no per-format parser.</p>
        </div>
        <div className="flex gap-2">
          <button className={btn} disabled={!!busy} onClick={readAll}>Read all replies</button>
          <button className={btnGhost} disabled={done === 0} onClick={next}>Compare →</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {inbox.map((e) => {
          const v = s.vendors.find((x) => x.vendorId === e.id);
          const st = state[e.id];
          return (
            <div key={e.id} className={`${card} p-4 text-sm`}>
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-semibold">{e.name} <span className="text-xs font-normal text-zinc-500">· {e.received}</span></p>
                  <p className="text-xs text-zinc-500">{e.subject}</p>
                </div>
                <button className={btnGhost} disabled={!!busy} onClick={() => read(e.id)}>{v ? "Re-read" : st === "running" ? "Reading…" : "Read with AI"}</button>
              </div>
              <p className="text-xs mt-1 italic text-zinc-600 dark:text-zinc-400">{e.note}</p>
              <ul className="mt-2 text-xs space-y-0.5">
                {e.files.map((f) => (
                  <li key={f.file}><a className="underline text-teal-700 dark:text-teal-400" href={`/samples/vendors/${f.file}`} target="_blank" rel="noreferrer">{f.file}</a> <span className="text-zinc-400">({f.role})</span></li>
                ))}
              </ul>
              {st === "running" && <p className="mt-2 text-xs text-zinc-500 animate-pulse">Reading… (first read of a file is a real model call; repeats are cached)</p>}
              {v && (
                <div className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-2 text-xs space-y-1">
                  <p>Priced <b>{new Set(v.extraction.quotes.map((q) => q.lineId)).size}/{s.lines.length}</b> lines {v.fromCache && <span className="text-zinc-400">· from cache</span>}</p>
                  {v.warnings.map((w) => <p key={w} className="text-amber-800 dark:text-amber-200">⚠ {w}</p>)}
                  {v.extraction.notes.slice(0, 3).map((n) => <p key={n} className="text-zinc-600 dark:text-zinc-400">• {n}</p>)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`${card} p-4 text-sm`}>
        <h3 className="font-semibold mb-1">Or drop in a real vendor reply</h3>
        <p className="text-xs text-zinc-500 mb-2">First file = the reply, the rest are attachments. Any of: .xlsx .pdf .docx .jpg/.png .txt</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Vendor name" className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm" />
          <input ref={fileRef} type="file" multiple className="text-xs" />
          <button className={btn} disabled={!!busy} onClick={upload}>Read file(s)</button>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── 4. Compare ─────────────────────────────

function Compare({ s, setS, run, busy }: P) {
  const [tab, setTab] = useState<"prices" | "terms" | "quality">("prices");
  const [sel, setSel] = useState<{ lineId: string; vendorId: string } | null>(null);
  const [ev, setEv] = useState<EvalResult | null>(null);
  const [fx, setFx] = useState(String(s.fxUsdInr));
  const cell = useMemo(() => { const m = new Map<string, NormalizedCell>(); s.normalized.forEach((c) => m.set(`${c.lineId}:${c.vendorId}`, c)); return m; }, [s.normalized]);
  const act = async (body: unknown) => { const r = await run("cell", () => api<SessionView>("/api/cell", body)); if (r) setS(r); };

  if (s.vendors.length === 0) return <p className="text-sm text-zinc-500">Read the vendor replies first (step 3).</p>;
  const counts = (vid: string) => {
    const cs = s.normalized.filter((c) => c.vendorId === vid);
    const n = (st: string) => cs.filter((c) => c.status === st).length;
    return { ok: n("ok"), review: n("review"), confirmed: n("confirmed"), missing: n("missing"), excluded: n("excluded") };
  };
  const selCell = sel ? cell.get(`${sel.lineId}:${sel.vendorId}`) : undefined;
  const selLine = sel ? s.lines.find((l) => l.lineId === sel.lineId) : undefined;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(["prices", "terms", "quality"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm border ${tab === t ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}>
              {t === "prices" ? "Prices (INR/unit)" : t === "terms" ? "Commercial terms" : "Questionnaire & documents"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">USD→INR
            <input value={fx} onChange={(e) => setFx(e.target.value)} onBlur={() => Number(fx) > 0 && Number(fx) !== s.fxUsdInr && act({ action: "set_fx", fxUsdInr: Number(fx) })} className="w-16 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1.5 py-1" />
            <span className="text-zinc-400">buyer assumption</span>
          </label>
          <a className={btnGhost} href="/api/export?type=comparison">Export matrix CSV</a>
          <a className={btnGhost} href="/api/export?type=questionnaire">Export questionnaire CSV</a>
          <button className={btnGhost} onClick={async () => { const r = await run("eval", () => api<EvalResult>("/api/eval")); if (r) setEv(r); }}>Score vs ground truth</button>
        </div>
      </div>

      {ev && <EvalPanel ev={ev} close={() => setEv(null)} />}

      {tab === "prices" && (
        <div className="grid xl:grid-cols-[1fr_340px] gap-3 items-start">
          <div className={`${card} overflow-auto max-h-[70vh]`}>
            <table className="min-w-[860px] w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  <th className="p-2 sticky top-0 left-0 z-10 bg-zinc-100 dark:bg-zinc-800 min-w-[190px]">Line</th>
                  {s.vendors.map((v) => {
                    const c = counts(v.vendorId);
                    const g = s.gates.find((x) => x.vendorId === v.vendorId);
                    return (
                      <th key={v.vendorId} className="p-2 sticky top-0 z-[5] bg-zinc-100 dark:bg-zinc-800 min-w-[130px] align-top">
                        <div className="font-semibold">{v.vendorName.split(" ")[0]}</div>
                        <div className="font-normal text-[10px] text-zinc-500">{c.ok + c.review + c.confirmed}/{s.lines.length} quoted{c.review ? ` · ${c.review} to check` : ""}</div>
                        <span className={`inline-block mt-0.5 px-1.5 rounded text-[10px] ${GATE_STYLE[g?.status ?? "unverified"]}`}>quality: {g?.status}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l) => (
                  <tr key={l.lineId}>
                    <td className="p-2 sticky left-0 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="font-mono">{l.lineId}</span> <span className="text-zinc-500">{l.description.split(",")[0].slice(0, 34)}</span>
                    </td>
                    {s.vendors.map((v) => {
                      const c = cell.get(`${l.lineId}:${v.vendorId}`);
                      const active = sel?.lineId === l.lineId && sel.vendorId === v.vendorId;
                      return (
                        <td key={v.vendorId} className="p-1 border-t border-zinc-100 dark:border-zinc-800">
                          {c && (
                            <button onClick={() => setSel({ lineId: l.lineId, vendorId: v.vendorId })} className={`w-full text-left rounded border px-1.5 py-1 ${STATUS_STYLE[c.status]} ${active ? "ring-2 ring-teal-600" : ""}`}>
                              <div className="font-medium">{c.status === "missing" ? "—" : inr(c.netInr)}</div>
                              <div className="text-[10px] text-zinc-500">{STATUS_LABEL[c.status]}{c.status !== "missing" && c.status !== "confirmed" ? ` · ${Math.round(c.confidence * 100)}%` : ""}</div>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`${card} p-4 text-xs xl:sticky xl:top-20`}>
            {!selCell || !selLine ? (
              <div className="space-y-2 text-zinc-500">
                <p className="font-semibold text-zinc-700 dark:text-zinc-200">Click any cell</p>
                <p>See exactly what the vendor wrote, how it was converted, and why the system is or isn&apos;t sure. Confirm or correct it — award math uses your version.</p>
                <div className="grid grid-cols-2 gap-1 pt-2">
                  {(Object.keys(STATUS_STYLE) as NormalizedCell["status"][]).map((k) => <span key={k} className={`rounded border px-1.5 py-1 ${STATUS_STYLE[k]}`}>{STATUS_LABEL[k]}</span>)}
                </div>
              </div>
            ) : (
              <CellDetail c={selCell} lineDesc={`${selLine.lineId} · ${selLine.description}`} lastPaid={selLine.lastPaidInr} target={selLine.targetInrPerBox} vendorName={s.vendors.find((v) => v.vendorId === selCell.vendorId)?.vendorName ?? ""} busy={!!busy} act={act} fileNames={s.vendors.find((v) => v.vendorId === selCell.vendorId)?.files.map((f) => f.name) ?? []} />
            )}
          </div>
        </div>
      )}

      {tab === "terms" && (
        <div className={`${card} overflow-auto`}>
          <table className="w-full text-xs">
            <thead><tr className="bg-zinc-100 dark:bg-zinc-800 text-left"><th className="p-2">Term</th>{s.vendors.map((v) => <th key={v.vendorId} className="p-2">{v.vendorName.split(" ")[0]}</th>)}</tr></thead>
            <tbody>
              {([
                ["Incoterm / delivery", (t: SessionView["vendors"][0]["extraction"]["terms"]) => t.incoterm],
                ["Freight", (t) => `${t.freight}${t.freightNote ? ` — ${t.freightNote}` : ""}`],
                ["Payment", (t) => t.paymentTerms],
                ["Validity", (t) => t.validity],
                ["GST", (t) => t.gst],
                ["MOQ", (t) => t.moq],
                ["Lead time", (t) => t.leadTime],
                ["Discounts", (t) => t.discounts.map((d) => `${d.percent ?? "?"}% ${d.conditional ? "CONDITIONAL — not applied" : "applied"}: ${d.condition ?? d.description}`).join("; ")],
                ["Other", (t) => t.other.join("; ")],
              ] as [string, (t: SessionView["vendors"][0]["extraction"]["terms"]) => string | undefined][]).map(([label, fn]) => (
                <tr key={label} className="border-t border-zinc-100 dark:border-zinc-800 align-top">
                  <td className="p-2 font-medium whitespace-nowrap">{label}</td>
                  {s.vendors.map((v) => <td key={v.vendorId} className="p-2">{fn(v.extraction.terms) || <span className="text-zinc-400">not stated</span>}</td>)}
                </tr>
              ))}
              <tr className="border-t border-zinc-100 dark:border-zinc-800 align-top">
                <td className="p-2 font-medium">Vendor notes</td>
                {s.vendors.map((v) => <td key={v.vendorId} className="p-2">{v.extraction.notes.join(" • ") || "—"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "quality" && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {s.gates.map((g) => {
            const v = s.vendors.find((x) => x.vendorId === g.vendorId)!;
            return (
              <div key={g.vendorId} className={`${card} p-4 text-xs`}>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-sm">{v.vendorName}</h3>
                  <span className={`px-2 py-0.5 rounded-full ${GATE_STYLE[g.status]}`}>{g.status}</span>
                </div>
                <ul className="space-y-1.5">
                  {g.questions.map((q) => (
                    <li key={q.questionId}>
                      <span className={q.verdict === "pass" ? "text-emerald-700" : q.verdict === "fail" ? "text-rose-700" : "text-amber-700"}>● {q.verdict}</span> {q.text.split("(")[0]} — <b>{q.answer}</b>
                      {q.note && <div className="text-amber-800 dark:text-amber-200 ml-3">{q.note}</div>}
                      {q.evidence && <div className="text-zinc-500 ml-3 italic">“{q.evidence}”</div>}
                    </li>
                  ))}
                </ul>
                {v.extraction.documents.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="font-medium mb-1">Attached documents</p>
                    {v.extraction.documents.map((d) => (
                      <p key={d.fileName}><a className="underline text-teal-700 dark:text-teal-400" href={`/samples/vendors/${d.fileName}`} target="_blank" rel="noreferrer">{d.fileName}</a> — {d.summary}{d.validUntil ? ` (valid until ${d.validUntil})` : ""}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CellDetail({ c, lineDesc, lastPaid, target, vendorName, busy, act, fileNames }: { c: NormalizedCell; lineDesc: string; lastPaid: number; target: number; vendorName: string; busy: boolean; act: (b: unknown) => void; fileNames: string[] }) {
  const [price, setPrice] = useState("");
  const blocking = c.flags.filter((f) => !["unit_per_100", "unit_per_1000", "usd_converted", "discount_applied", "kg_converted_stated_weight", "conditional_discount_available"].includes(f));
  return (
    <div className="space-y-2">
      <p className="font-semibold text-sm">{vendorName}</p>
      <p className="text-zinc-500">{lineDesc}</p>
      <div className={`rounded border px-2 py-1.5 ${STATUS_STYLE[c.status]}`}>
        <p className="text-base font-semibold">{c.status === "missing" ? "Not quoted" : inr(c.netInr, 3)}</p>
        <p className="text-zinc-500">{STATUS_LABEL[c.status]} · confidence {Math.round(c.confidence * 100)}%</p>
      </div>
      {c.quoted && <p><b>Vendor wrote:</b> {c.quoted.price ?? "(no number)"} {c.quoted.currency} · {c.quoted.basis.replace(/_/g, " ")}</p>}
      {c.note && <p><b>Conversion:</b> {c.note}</p>}
      {c.evidence && <p className="rounded bg-zinc-100 dark:bg-zinc-800 p-2 italic">“{c.evidence}”{c.location ? <span className="not-italic text-zinc-500"> — {c.location}</span> : null}</p>}
      {c.interpretation && <p className="text-amber-800 dark:text-amber-200"><b>Interpretation:</b> {c.interpretation}</p>}
      {c.flags.length > 0 && <ul className="list-disc pl-4">{c.flags.map((f) => <li key={f}>{FLAG_LABELS[f as Flag]}</li>)}</ul>}
      {c.status !== "missing" && <p className="text-zinc-500">Context: target {inr(target)} · you paid {inr(lastPaid)} last year</p>}
      {fileNames.length > 0 && <p className="text-zinc-500">Source: {fileNames.map((f) => <a key={f} className="underline mr-1" href={`/samples/vendors/${f}`} target="_blank" rel="noreferrer">{f}</a>)}</p>}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {(c.status === "review" || c.status === "ok") && <button disabled={busy} className={btn} onClick={() => act({ action: "confirm", vendorId: c.vendorId, lineId: c.lineId })}>Confirm</button>}
        {c.status === "review" && blocking[0] && <button disabled={busy} className={btnGhost} onClick={() => act({ action: "confirm_group", vendorId: c.vendorId, flag: blocking[0] })}>Confirm all “{FLAG_LABELS[blocking[0]]}” for this vendor</button>}
        {c.buyer && <button disabled={busy} className={btnGhost} onClick={() => act({ action: "undo", vendorId: c.vendorId, lineId: c.lineId })}>Undo</button>}
      </div>
      <div className="flex gap-1.5 items-center">
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Correct ₹/unit" className="w-28 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1.5 py-1" />
        <button disabled={busy || !(Number(price) > 0)} className={btnGhost} onClick={() => act({ action: "override", vendorId: c.vendorId, lineId: c.lineId, price: Number(price) })}>Override</button>
      </div>
    </div>
  );
}

function EvalPanel({ ev, close }: { ev: EvalResult; close: () => void }) {
  return (
    <div className={`${card} p-4 text-xs`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-sm">Extraction accuracy against the dataset&apos;s ground truth</h3>
          <p className="text-zinc-500">The demo data is fabricated, so every right answer is known. <b>{ev.totals.correct}/{ev.totals.cells}</b> cells correct ({ev.totals.accuracyPct}%). Wrong but flagged for review: <b>{ev.totals.wrongFlagged}</b>. <b className={ev.totals.wrongSilent ? "text-rose-700" : "text-emerald-700"}>Wrong and NOT flagged: {ev.totals.wrongSilent}</b> — the number that matters.</p>
        </div>
        <button className={btnGhost} onClick={close}>close</button>
      </div>
      <table className="mt-2 w-full">
        <thead><tr className="text-left text-zinc-500"><th>Vendor</th><th>Correct</th><th>Wrong, flagged</th><th>Wrong, silent</th><th>Not extracted</th><th>Missing lines</th><th>Quality gate (expected → actual)</th></tr></thead>
        <tbody>
          {ev.rows.map((r) => (
            <tr key={r.vendorId} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1">{r.vendorId}</td><td>{r.correct}/{r.truthCells}</td><td>{r.wrongFlagged}</td><td className={r.wrongSilent ? "text-rose-700 font-semibold" : ""}>{r.wrongSilent}</td><td>{r.notExtracted}</td><td>{r.missingDetected}</td>
              <td className={r.gate.ok ? "text-emerald-700" : "text-rose-700"}>{r.gate.expected} → {r.gate.actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ev.rows.flatMap((r) => r.wrongSilentLines.map((l) => <p key={r.vendorId + l} className="text-rose-700">{r.vendorId} {l}</p>))}
    </div>
  );
}

// ───────────────────────────── 5. Analyst ─────────────────────────────

function Analyst({ s, setS, run, busy }: P) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a: AnalystAnswer }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log.length, busy]);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setQ("");
    const r = await run("analyst", () => api<AnalystAnswer>("/api/analyst", { question }));
    if (r) { setLog((l) => [...l, { q: question, a: r }]); api<SessionView>("/api/session").then(setS).catch(() => {}); }
    else setQ(question);
  };
  if (s.vendors.length === 0) return <p className="text-sm text-zinc-500">Read the vendor replies first (step 3).</p>;
  const reviewCells = s.normalized.filter((c) => c.status === "review").length;

  return (
    <section className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
      <div className="space-y-3">
        {log.map((e, i) => (
          <div key={i} className={`${card} p-4 space-y-3`}>
            <p className="text-sm font-medium">{e.q}</p>
            {e.a.incomplete && <p className="text-xs text-amber-800 dark:text-amber-200">⚠ {e.a.incomplete}</p>}
            {e.a.blocks.map((b, j) => <Block key={j} b={b} />)}
            <Trace steps={e.a.trace} label={`How this was computed (${e.a.trace.length} tool calls)`} />
          </div>
        ))}
        {busy === "analyst" && <div className={`${card} p-4 text-sm text-zinc-500 animate-pulse`}>Analysing… (the model is calling the comparison tools)</div>}
        <div ref={endRef} />
        <form className={`${card} p-3 flex gap-2 sticky bottom-3`} onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about the comparison…" className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm" />
          <button className={btn} disabled={!!busy || !q.trim()}>Ask</button>
        </form>
      </div>

      <div className={`${card} p-4 text-xs space-y-3`}>
        <div>
          <p className="font-semibold text-sm mb-1">Try asking</p>
          <ul className="space-y-1.5">
            {STARTERS.analyst.map((x) => <li key={x}><button className="text-left text-teal-800 dark:text-teal-300 hover:underline" disabled={!!busy} onClick={() => ask(x)}>{x}</button></li>)}
          </ul>
        </div>
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-1 text-zinc-600 dark:text-zinc-400">
          <p><b>{reviewCells}</b> cells still need your confirmation. Answers show how much rests on them.</p>
          <p>Free text welcome: these are suggestions, not scripts.</p>
          <a className="underline block" href="/api/export?type=award&qualified=true">Download split award (quality-gated)</a>
          <a className="underline block" href="/api/export?type=award&qualified=false">Download split award (all vendors)</a>
        </div>
      </div>
    </section>
  );
}

function Block({ b }: { b: AnalystBlock }) {
  if (b.kind === "text") {
    return (
      <div className={b.tone === "warning" ? "rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3" : ""}>
        <Md text={b.markdown} />
        {b.unverifiedFigures && (
          <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">⚠ Unverified figure(s) not found in any tool result: {b.unverifiedFigures.join(", ")}. Do not rely on them.</p>
        )}
      </div>
    );
  }
  if (b.kind === "chart") {
    const max = Math.max(...b.points.map((p) => p.value), 1);
    const f = (v: number) => (b.format === "inr" ? (v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : inr(v, 0)) : b.format === "pct" ? `${v}%` : String(v));
    return (
      <div>
        <p className="text-sm font-medium mb-1">{b.title}</p>
        <div className="space-y-1.5">
          {b.points.map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate">{p.label}</span>
              <div className="flex-1 h-3 bg-zinc-100 dark:bg-zinc-800 rounded"><div className="h-3 bg-teal-600 rounded" style={{ width: `${(p.value / max) * 100}%` }} /></div>
              <span className="w-24 text-right tabular-nums">{f(p.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const csv = [b.columns, ...b.rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  return (
    <div className="overflow-auto max-h-80">
      <div className="flex justify-between items-center mb-1">
        <p className="text-sm font-medium">{b.title}</p>
        <a className="text-[11px] underline text-zinc-500" href={href} download={`${b.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "table"}.csv`}>CSV</a>
      </div>
      <table className="w-full text-xs border border-zinc-200 dark:border-zinc-700">
        <thead><tr className="bg-zinc-50 dark:bg-zinc-800">{b.columns.map((c) => <th key={c} className="p-1.5 text-left">{c}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">{r.map((c, j) => <td key={j} className="p-1.5">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ───────────────────────────── shared bits ─────────────────────────────

function Trace({ steps, label }: { steps: TraceStep[]; label?: string }) {
  if (!steps?.length) return null;
  return (
    <details className="mt-2 text-[11px] text-zinc-500">
      <summary className="cursor-pointer">{label ?? `${steps.length} tool calls`}</summary>
      <ul className="mt-1 space-y-1 font-mono">
        {steps.map((t, i) => (
          <li key={i} className={t.ok ? "" : "text-rose-600"}>
            <b>{t.tool}</b>({JSON.stringify(t.input).slice(0, 110)}) → {t.summary}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Md({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  const lines = text.split("\n");
  return (
    <div className="text-sm space-y-1">
      {lines.map((l, i) => {
        if (/^\s*[-•*]\s+/.test(l)) return <p key={i} className="pl-4 -indent-3">• {inline(l.replace(/^\s*[-•*]\s+/, ""))}</p>;
        if (/^#{1,3}\s+/.test(l)) return <p key={i} className="font-semibold">{inline(l.replace(/^#+\s+/, ""))}</p>;
        if (!l.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{inline(l)}</p>;
      })}
    </div>
  );
}
