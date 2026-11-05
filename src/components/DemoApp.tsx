"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DemoSession, NormalizedQuoteCell } from "@/lib/types";
import { isQuestionnaireQualified } from "@/lib/types";
import { COPILOT_REPLY, COPILOT_SEED_PROMPT } from "@/lib/session-store";
import { DEMO_QUESTIONS, type AnalystResult } from "@/lib/analyst/engine";

type Step = "rfx" | "send" | "ingest" | "compare" | "analyst";

const STEPS: { id: Step; label: string }[] = [
  { id: "rfx", label: "1. RFx co-pilot" },
  { id: "send", label: "2. Send (stub)" },
  { id: "ingest", label: "3. Ingest" },
  { id: "compare", label: "4. Compare" },
  { id: "analyst", label: "5. Analyst" },
];

function confidenceClass(c: number): string {
  if (c >= 0.85) return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  if (c >= 0.75) return "bg-amber-500/15 text-amber-900 dark:text-amber-100";
  return "bg-rose-500/15 text-rose-900 dark:text-rose-100";
}

export default function DemoApp() {
  const [step, setStep] = useState<Step>("rfx");
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [copilotDone, setCopilotDone] = useState(false);
  const [sent, setSent] = useState(false);
  const [analystLog, setAnalystLog] = useState<Array<{ q: string; results: AnalystResult[] }>>([]);
  const [question, setQuestion] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/session");
    setSession(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const ingestAll = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ingest/demo-all", { method: "POST" });
      setSession(await res.json());
      setStep("compare");
    } finally {
      setLoading(false);
    }
  };

  const ask = async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (data.results) {
        setAnalystLog((prev) => [...prev, { q, results: data.results }]);
      }
    } finally {
      setLoading(false);
      setQuestion("");
    }
  };

  const vendorIds = useMemo(() => session?.vendors.map((v) => v.vendorId) ?? [], [session]);

  const cellMap = useMemo(() => {
    const m = new Map<string, NormalizedQuoteCell>();
    session?.normalized.forEach((c) => m.set(`${c.lineId}:${c.vendorId}`, c));
    return m;
  }, [session]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-600">Loading demo…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-700 dark:text-teal-400 font-semibold">
              Aerchain take-home demo
            </p>
            <h1 className="text-xl font-semibold">Kill the Quote Spreadsheet</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{session.title}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  step === s.id
                    ? "bg-teal-700 text-white border-teal-700"
                    : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {step === "rfx" && (
          <section className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <h2 className="font-semibold mb-3">AI co-pilot</h2>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3">Buyer: {COPILOT_SEED_PROMPT}</div>
                {copilotDone && (
                  <div className="rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 p-3">
                    Co-pilot: {COPILOT_REPLY}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="mt-4 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800"
                onClick={() => setCopilotDone(true)}
              >
                Generate RFx draft
              </button>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm overflow-auto max-h-[520px]">
              <h2 className="font-semibold mb-3">
                {session.rfxId} · {session.lines.length} lines
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">
                    <th className="py-2 pr-2">Line</th>
                    <th className="py-2 pr-2">SKU</th>
                    <th className="py-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {session.lines.map((l) => (
                    <tr key={l.lineId} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5 pr-2 font-mono">{l.lineId}</td>
                      <td className="py-1.5 pr-2 font-mono">{l.sku}</td>
                      <td className="py-1.5">{l.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {step === "send" && (
          <section className="max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <h2 className="font-semibold mb-2">Outbound (stubbed for live demo)</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              Email/SMTP is faked. For reliability, vendor replies are ingested from bundled sample files
              (Excel, PDF, Word, rate-card SVG, plain-text email).
            </p>
            <ul className="text-sm list-disc pl-5 mb-4 space-y-1">
              <li>PackRight Industries — off-template Excel (INR per 100 boxes)</li>
              <li>Global Carton LLC — USD PDF + 5% footnote discount</li>
              <li>Southern Board Mills — Word prose, 27/30 lines</li>
              <li>DesiPack Co — angled rate card (SVG), fails quality gate</li>
              <li>QuickPack — email with ₹/kg + “same as last year”</li>
            </ul>
            <button
              type="button"
              disabled={!copilotDone}
              onClick={() => setSent(true)}
              className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm disabled:opacity-40"
            >
              Mark RFx sent to 5 vendors
            </button>
            {sent && (
              <p className="mt-3 text-sm text-teal-700 dark:text-teal-400">
                Sent (simulated). Proceed to ingest vendor responses.
              </p>
            )}
          </section>
        )}

        {step === "ingest" && (
          <section className="space-y-6">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
              <h2 className="font-semibold mb-2">Ingest vendor responses</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Real parsers extract commercials and questionnaire signals from each file type — no hardcoded
                comparison grid.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={ingestAll}
                className="px-5 py-2.5 rounded-lg bg-teal-700 text-white font-medium text-sm hover:bg-teal-800 disabled:opacity-50"
              >
                {loading ? "Ingesting…" : "Load all 5 demo vendor files"}
              </button>
            </div>
            {session.vendors.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                {session.vendors.map((v) => (
                  <div
                    key={v.vendorId}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-semibold">{v.vendorName}</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          isQuestionnaireQualified(v.questionnaire)
                            ? "bg-emerald-500/15 text-emerald-800"
                            : "bg-rose-500/15 text-rose-800"
                        }`}
                      >
                        {isQuestionnaireQualified(v.questionnaire) ? "Quality pass" : "Quality fail"}
                      </span>
                    </div>
                    <p className="text-zinc-500 mt-1">{v.fileName}</p>
                    <p className="mt-2">
                      Lines priced: {v.rows.length}/{session.lines.length}
                    </p>
                    {v.warnings.length > 0 && (
                      <ul className="mt-2 text-amber-800 dark:text-amber-200 list-disc pl-4">
                        {v.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {step === "compare" && (
          <section className="space-y-4">
            {session.vendors.length === 0 ? (
              <p className="text-sm">Run ingest first.</p>
            ) : (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Side-by-side INR/box (normalized). Click provenance in analyst view. Flags: USD, per-100,
                  kg conversion, missing lines.
                </p>
                <div className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
                  <table className="min-w-[900px] w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-100 dark:bg-zinc-800 text-left">
                        <th className="p-2 sticky left-0 bg-zinc-100 dark:bg-zinc-800">Line</th>
                        <th className="p-2 sticky left-12 bg-zinc-100 dark:bg-zinc-800">SKU</th>
                        {session.vendors.map((v) => (
                          <th key={v.vendorId} className="p-2 min-w-[120px]">
                            {v.vendorName.split(" ")[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {session.lines.map((line) => (
                        <tr key={line.lineId} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="p-2 sticky left-0 bg-white dark:bg-zinc-900 font-mono">{line.lineId}</td>
                          <td className="p-2 sticky left-12 bg-white dark:bg-zinc-900 font-mono">{line.sku}</td>
                          {vendorIds.map((vid) => {
                            const cell = cellMap.get(`${line.lineId}:${vid}`);
                            if (!cell || !cell.quoted) {
                              return (
                                <td key={vid} className="p-2 text-zinc-400">
                                  —
                                </td>
                              );
                            }
                            return (
                              <td key={vid} className="p-2">
                                <div className="font-medium">₹{cell.unitPriceInr?.toFixed(2)}</div>
                                <div className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] ${confidenceClass(cell.confidence)}`}>
                                  {Math.round(cell.confidence * 100)}%
                                </div>
                                {cell.flags.length > 0 && (
                                  <div className="text-[10px] text-zinc-500 mt-1">{cell.flags.join(" · ")}</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {step === "analyst" && (
          <section className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <h2 className="font-semibold mb-3">Ask the comparison</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (question.trim()) ask(question.trim());
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. Split award cheapest per line among vendors who cleared quality"
                    className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={loading || session.vendors.length === 0}
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm disabled:opacity-40"
                  >
                    Ask
                  </button>
                </form>
              </div>
              {analystLog.map((entry, i) => (
                <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
                  <p className="text-sm font-medium">Q: {entry.q}</p>
                  {entry.results.map((r, j) => (
                    <AnalystBlock key={j} result={r} />
                  ))}
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
              <h3 className="font-semibold text-sm mb-3">Suggested demo questions</h3>
              <ul className="space-y-2">
                {DEMO_QUESTIONS.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      className="text-left text-sm text-teal-800 dark:text-teal-300 hover:underline"
                      onClick={() => ask(q)}
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function AnalystBlock({ result }: { result: AnalystResult }) {
  if (result.kind === "text") {
    return <p className="text-sm whitespace-pre-wrap">{result.text.replace(/\*\*/g, "")}</p>;
  }
  if (result.kind === "chart") {
    const max = Math.max(...result.points.map((p) => p.value), 1);
    return (
      <div>
        <p className="text-sm font-medium mb-2">{result.title}</p>
        <div className="space-y-2">
          {result.points.map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-xs">
              <span className="w-20 truncate">{p.label}</span>
              <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded">
                <div className="h-2 bg-teal-600 rounded" style={{ width: `${(p.value / max) * 100}%` }} />
              </div>
              <span className="w-24 text-right">₹{(p.value / 1e7).toFixed(2)} Cr</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-auto">
      <p className="text-sm font-medium mb-2">{result.title}</p>
      <table className="w-full text-xs border border-zinc-200 dark:border-zinc-700">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-800">
            {result.columns.map((c) => (
              <th key={c} className="p-2 text-left">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri} className="border-t border-zinc-100 dark:border-zinc-800">
              {row.map((cell, ci) => (
                <td key={ci} className="p-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
