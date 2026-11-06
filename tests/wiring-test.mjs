// Wiring smoke test. Run the app against the fake model server first:
//   node tests/fake-anthropic.mjs &
//   GEMINI_BASE_URL=http://127.0.0.1:9999 GEMINI_API_KEY=test npm run dev -- -p 4400   (or the ANTHROPIC_* equivalents)
//   npm run test:wiring
// Proves: SDK → tool loop → normalization (units, FX, kg, baseline) → quality gate → award engine → eval → figure verifier.
// Does NOT prove model accuracy: the fake model returns the ground truth.
const B = process.env.APP_URL || "http://127.0.0.1:4400";
let failed = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failed++; };
const post = async (u, b) => (await fetch(B + u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b ?? {}) })).json();
const near = (a, b, t = 0.01) => Math.abs(a - b) <= t;

await post("/api/session/reset");
let s = (await post("/api/copilot", { message: "build the rfx" })).session;
ok(s.lines.length === 30 && s.rfx.questionnaire.length === 4 && s.rfx.email, "co-pilot tools populated the RFx (30 lines, 4 questions, email)");
await post("/api/rfx/send");
for (const v of ["packright", "global", "southern", "desipack", "quickpack"]) s = await post("/api/ingest/bundled", { vendorId: v });
ok(s.vendors.length === 5, "five vendors ingested");
const cell = (v, l) => s.normalized.find((c) => c.vendorId === v && c.lineId === l);
ok(cell("packright", "L10").flags.includes("unit_per_1000") && near(cell("packright", "L10").netInr, 3.28), "PackRight L10: per-1000 converted in code");
ok(cell("global", "L01").flags.includes("usd_converted") && cell("global", "L01").flags.includes("conditional_discount_available"), "Global L01: USD converted, conditional discount NOT applied");
ok(cell("southern", "L05").status === "review" && cell("southern", "L05").flags.includes("spec_deviation"), "Southern L05: spec deviation sent to review");
ok(cell("southern", "L29").status === "missing", "Southern L29: missing line shown as a gap");
ok(cell("quickpack", "L01").status === "review" && near(cell("quickpack", "L01").netInr, 36.54, 0.02), "QuickPack L01: ₹/kg × nominal weight, interpretation needs confirmation");
ok(cell("quickpack", "L05").flags.includes("baseline_from_buyer_history") && near(cell("quickpack", "L05").netInr, 200.51), "QuickPack L05: 'same as last year' = buyer's PO history");
const gate = (v) => s.gates.find((g) => g.vendorId === v).status;
ok(gate("packright") === "cleared" && gate("global") === "cleared", "gate: PackRight, Global cleared");
ok(gate("southern") === "conflict", "gate: Southern = conflict (expired ISO certificate beats the 'yes')");
ok(gate("desipack") === "failed" && gate("quickpack") === "failed", "gate: DesiPack, QuickPack failed");

const ev = await (await fetch(B + "/api/eval")).json();
ok(ev.totals.wrongSilent === 0, `eval: no silent errors (${ev.totals.correct}/${ev.totals.cells} correct)`);

// buyer-in-the-loop: confirm a whole interpretation, award math follows
const before = s.normalized.filter((c) => c.vendorId === "quickpack" && c.status === "review").length;
s = await post("/api/cell", { action: "confirm_group", vendorId: "quickpack", flag: "scope_inference" });
const after = s.normalized.filter((c) => c.vendorId === "quickpack" && c.status === "review").length;
ok(before === 30 && after === 0, "confirm_group clears the interpretation for the vendor");
s = await post("/api/cell", { action: "override", vendorId: "packright", lineId: "L01", price: 99 });
ok(near(s.normalized.find((c) => c.vendorId === "packright" && c.lineId === "L01").netInr, 99), "buyer override replaces the machine value");
await post("/api/cell", { action: "undo", vendorId: "packright", lineId: "L01" });

const a = await post("/api/analyst", { question: "split among qualified" });
const text = a.blocks.find((b) => b.kind === "text");
ok(a.blocks.some((b) => b.kind === "table" && b.rows.length === 30), "analyst table rendered from tool result (30 rows)");
ok(text.unverifiedFigures?.includes("99,99,999"), "figure verifier flags a number that is in no tool result");
const csv = await (await fetch(B + "/api/export?type=award&qualified=true")).text();
ok(/EXCLUDED,Southern/.test(csv) && /LINES_AWARDED,30\/30/.test(csv), "award export lists exclusions and coverage");

console.log(failed ? `\n${failed} FAILED` : "\nall wiring checks passed");
process.exit(failed ? 1 : 0);
