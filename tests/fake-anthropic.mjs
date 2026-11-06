// TEST HARNESS ONLY — not used by the app. Pretends to be api.anthropic.com AND the Gemini generateContent endpoint so the wiring
// (SDK → tool loop → normalization → award engine → eval) can be smoke-tested without a key.
// It proves plumbing, NOT model quality. Real accuracy is measured by "Score vs ground truth" in the UI.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const truth = JSON.parse(fs.readFileSync(path.join(root, "src/data/ground-truth.json"), "utf8"));
const lines = JSON.parse(fs.readFileSync(path.join(root, "src/data/rfx-lines.json"), "utf8"));
const VENDOR_BY_FILE = { "1-packright": "packright", "2-global": "global", "3-southern": "southern", "4-desipack": "desipack", "5-quickpack": "quickpack" };

function extractionFor(vendorId) {
  const t = truth.vendors[vendorId];
  const quotes = [];
  for (const l of lines) {
    const x = t.lines[l.lineId];
    if (!x) continue;
    const base = { lineId: l.lineId, currency: x.currency, evidence: `${l.sku} ${x.price}`, confidence: 0.92, confidenceReason: "clean table row", matchedBy: "sku" };
    if (vendorId === "packright") {
      const unit = ["L10", "L24", "L26"].includes(l.lineId) ? 1000 : 100;
      quotes.push({ ...base, price: Math.round(x.price * unit), basis: unit === 100 ? "per_100" : "per_1000", matchedBy: "description", evidence: `${l.description.split(",")[0]} ${Math.round(x.price * unit)}` });
    } else if (vendorId === "quickpack") {
      if (l.plies === 7) quotes.push({ ...base, price: null, basis: "same_as_last_year", matchedBy: "scope_inference", evidence: "rest same as last year", confidence: 0.8, interpretation: "'rest' = lines that are neither 5-ply nor 3-ply" });
      else quotes.push({ ...base, price: l.plies === 5 ? 42 : 38, basis: "per_kg", matchedBy: "scope_inference", evidence: l.plies === 5 ? "₹42/kg for the 5-ply" : "38 for the 3-ply", confidence: 0.85, interpretation: `Applied to all ${l.plies}-ply lines` });
    } else if (vendorId === "desipack") {
      quotes.push({ ...base, price: x.price, basis: "per_unit", matchedBy: "description", confidence: 0.7, location: "image, row " + l.lineId, evidence: `${l.description.split(",")[0].toUpperCase()} Rs. ${x.price.toFixed(2)}` });
    } else if (vendorId === "southern") {
      quotes.push({ ...base, price: x.price, basis: "per_unit", evidence: `${l.sku}: Rs. ${x.price.toFixed(2)}`, ...(l.lineId === "L05" ? { specDeviation: "Vendor offers 5-ply instead of 7-ply" } : {}) });
    } else quotes.push({ ...base, price: x.price, basis: "per_unit", evidence: `${l.sku} USD ${x.price.toFixed(3)} / box` });
  }
  const answers = {
    packright: [["q_iso", "yes"], ["q_brcgs", "yes"], ["q_moisture", "yes"], ["q_audit", "88"]],
    global: [["q_iso", "yes"], ["q_brcgs", "yes"], ["q_moisture", "yes"], ["q_audit", "91"]],
    southern: [["q_iso", "yes"], ["q_brcgs", "yes"], ["q_moisture", "yes"], ["q_audit", "84"]],
    desipack: [["q_iso", "not_stated"], ["q_brcgs", "not_stated"], ["q_moisture", "no"], ["q_audit", "72"]],
    quickpack: [["q_iso", "yes"], ["q_brcgs", "no"], ["q_moisture", "yes"], ["q_audit", "79"]],
  }[vendorId].map(([questionId, answer]) => ({ questionId, answer, evidence: answer === "not_stated" ? undefined : "stated by vendor" }));
  const documents = {
    global: [{ fileName: "2b-global-iso9001-certificate.pdf", docType: "iso_9001_certificate", validUntil: "2027-08-14", summary: "ISO 9001:2015" }],
    southern: [{ fileName: "3b-southern-iso9001-certificate.pdf", docType: "iso_9001_certificate", validUntil: "2026-03-31", summary: "ISO 9001:2015" }],
    quickpack: [{ fileName: "5b-quickpack-moisture-test-report.pdf", docType: "moisture_test_report", summary: "7.6% moisture" }],
  }[vendorId] ?? [];
  return {
    quotes,
    omitted: t.missing.map((lineId) => ({ lineId, reason: vendorId === "southern" ? "pending flute availability" : "not mentioned" })),
    terms: {
      incoterm: vendorId === "global" ? "FOB Dallas" : vendorId === "desipack" ? "ex-works Pune" : "DAP",
      freight: vendorId === "southern" || vendorId === "quickpack" ? "extra" : vendorId === "global" ? "extra" : "included",
      discounts: vendorId === "global" ? [{ description: "volume discount", percent: 5, conditional: true, condition: "orders above MOQ, credited on final invoice" }] : [],
      other: [],
    },
    answers, documents, notes: [],
  };
}

const toolUse = (name, input, i) => ({ type: "tool_use", id: `toolu_${name}_${i}`, name, input });
const reply = (content, stop = "tool_use") => ({ id: "msg_fake", type: "message", role: "assistant", model: "fake", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });

function respond(body) {
  const msgs = body.messages;
  if (body.tool_choice?.name === "submit_extraction") {
    const first = msgs[0].content;
    const hdr = first.filter((b) => b.type === "text" && b.text.startsWith("=== FILE:"))[0].text;
    const vid = Object.entries(VENDOR_BY_FILE).find(([k]) => hdr.includes(k))?.[1];
    return reply([toolUse("submit_extraction", extractionFor(vid), 0)]);
  }
  const results = msgs.filter((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")).length;
  const isAnalyst = body.system.includes("analyst inside");
  if (isAnalyst) {
    if (results === 0) return reply([toolUse("compute_award", { strategy: "split", qualifiedOnly: true }, 1)]);
    if (results === 1) return reply([toolUse("compare_vendors", {}, 2)]);
    return reply([toolUse("present", {
      blocks: [
        { type: "text", markdown: `Split award among cleared vendors is about ₹99,99,999 (made-up figure to test the verifier).` },
        { type: "table", title: "Award", resultId: "r1", path: "allocations", columns: [{ key: "lineId", label: "Line" }, { key: "vendorName", label: "Vendor" }, { key: "unitPriceInr", label: "₹/unit", format: "inr2" }, { key: "spendInr", label: "Spend", format: "inr" }], limit: 40 },
        { type: "chart", title: "Like-for-like total", resultId: "r2", path: "vendors", labelKey: "vendorName", valueKey: "likeForLikeTotalInr", format: "inr" },
      ],
    }, 3)]);
  }
  // co-pilot script
  if (results === 0) return reply([toolUse("search_item_master", {}, 1)]);
  if (results === 1) {
    return reply([
      toolUse("set_lines", { lineIds: lines.map((l) => l.lineId) }, 2),
      toolUse("set_terms", { title: "Corrugated packaging — Bangalore DC", deliveryLocation: "Bangalore DC", paymentDays: 45 }, 3),
      toolUse("set_questionnaire", { questions: [
        { id: "q_iso", text: "Is your ISO 9001 certificate current? (attach it)", type: "yesno", required: true },
        { id: "q_brcgs", text: "Are you BRCGS Packaging Materials certified?", type: "yesno", required: true },
        { id: "q_moisture", text: "Do you provide a moisture test report? (attach it)", type: "yesno", required: true },
        { id: "q_audit", text: "Score of your last third-party quality audit (0–100)", type: "number", required: true, min: 80 },
      ] }, 4),
      toolUse("draft_vendor_email", { subject: "RFx CORR-2026-118", body: "Please quote in any format." }, 5),
      toolUse("finalize_rfx", {}, 6),
    ]);
  }
  return reply([{ type: "text", text: "RFx drafted and finalized (fake harness)." }], "end_turn");
}


// ── Gemini flavour: translate generateContent <-> the Anthropic-shaped script above, and check the
//    things a real Gemini call would reject (thought signatures must be echoed, tools declared, names on responses).
function geminiToAnthropic(g) {
  const sys = g.systemInstruction?.parts?.map((p) => p.text).join("\n") ?? String(g.systemInstruction ?? "");
  const names = new Map();
  const messages = g.contents.map((c) => ({
    role: c.role === "model" ? "assistant" : "user",
    content: c.parts.map((p, i) => {
      if (p.text !== undefined) return { type: "text", text: p.text };
      if (p.inlineData) return { type: "image", source: {} };
      if (p.functionCall) { const id = `${p.functionCall.name}_${i}`; names.set(p.functionCall.name, id); return { type: "tool_use", id, name: p.functionCall.name, input: p.functionCall.args }; }
      if (p.functionResponse) { if (!p.functionResponse.name) throw new Error("functionResponse without name"); return { type: "tool_result", tool_use_id: names.get(p.functionResponse.name) ?? "x", content: JSON.stringify(p.functionResponse.response) }; }
      throw new Error("unknown part " + JSON.stringify(p).slice(0, 80));
    }),
  }));
  const cfg = g.toolConfig?.functionCallingConfig;
  const decls = g.tools?.[0]?.functionDeclarations ?? [];
  if (!decls.length || !decls.every((d) => d.name && d.parametersJsonSchema)) throw new Error("tools must be declared with parametersJsonSchema");
  return { system: sys, messages, tool_choice: cfg?.mode === "ANY" ? { name: cfg.allowedFunctionNames?.[0] } : undefined };
}
let sigIssued = 0;
function anthropicToGemini(a) {
  const parts = a.content.map((b, i) => b.type === "text" ? { text: b.text } : { functionCall: { name: b.name, args: b.input }, ...(i === 0 ? { thoughtSignature: `sig-${++sigIssued}` } : {}) });
  return { candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } };
}
function checkSignatures(g) {
  // every model turn that had a signature when issued must carry one back
  const modelCalls = g.contents.filter((c) => c.role === "model").flatMap((c) => c.parts).filter((p, i, arr) => p.functionCall);
  const firstOfTurn = g.contents.filter((c) => c.role === "model").map((c) => c.parts[0]).filter((p) => p?.functionCall);
  for (const p of firstOfTurn) if (!p.thoughtSignature) throw new Error("thoughtSignature was not echoed back");
  return modelCalls.length;
}

http.createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    try {
      const parsed = JSON.parse(data);
      let out;
      if (req.url.includes(":generateContent")) {
        checkSignatures(parsed);
        out = anthropicToGemini(respond(geminiToAnthropic(parsed)));
      } else out = respond(parsed);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: String(e), code: 500, status: "INTERNAL" } }));
    }
  });
}).listen(Number(process.env.PORT || 9999), () => console.log("fake anthropic on", process.env.PORT || 9999));
