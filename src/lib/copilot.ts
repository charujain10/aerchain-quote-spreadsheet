import type Anthropic from "@anthropic-ai/sdk";
import type { DemoSession, QuestionDef } from "./types";
import { runToolLoop, type ToolDef, type TraceStep } from "./llm";
import { ITEM_MASTER, syncLines } from "./session-store";

const SYSTEM = `You are the RFx co-pilot inside a procurement tool. A category buyer talks to you to create an RFx; you turn the conversation into a structured RFx by calling tools. You never write the RFx "in prose only": the RFx is whatever the tools have set.

- The buyer's item master is the only source of line items. Use search_item_master to browse it, then set_lines. Never invent SKUs or specs.
- Ask for what is genuinely missing (delivery location, payment terms, quality requirements) but do not interrogate: propose sensible defaults, set them, and say what you assumed so the buyer can change it.
- Questionnaire: propose gating questions that match the buyer's quality concerns. Each question needs an id (q_…), text, type (yesno|number) and a gate rule. Keep the ids q_iso, q_brcgs, q_moisture, q_audit for those four standard checks; the evaluation engine understands them.
- Vendors may reply in any format (Excel, PDF, Word, photo, email). Do not ask them to use a template. Say so in the cover email.
- When the buyer is happy, call finalize_rfx. Then briefly summarise: line count, annual spend at target, questionnaire gate, terms.
- Be concise. No filler.`;

const tools: ToolDef[] = [
  {
    name: "search_item_master",
    description: "Search the buyer's item master. Returns items (lineId, sku, description, plies, qty, targetInrPerBox). Empty query returns everything.",
    input_schema: { type: "object", properties: { query: { type: "string" } } },
  },
  {
    name: "set_lines",
    description: "Set the RFx line items (replaces the current list). Optionally override annual quantities.",
    input_schema: {
      type: "object",
      properties: {
        lineIds: { type: "array", items: { type: "string" } },
        qtyOverrides: { type: "object", additionalProperties: { type: "number" } },
      },
      required: ["lineIds"],
    },
  },
  {
    name: "set_terms",
    description: "Set commercial terms and RFx title.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        deliveryLocation: { type: "string" },
        paymentDays: { type: "number" },
        incoterm: { type: "string" },
        validityDays: { type: "number" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "set_questionnaire",
    description: "Replace the supplier questionnaire (and the gate used to qualify vendors for award scenarios).",
    input_schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              type: { type: "string", enum: ["yesno", "number"] },
              required: { type: "boolean" },
              min: { type: "number", description: "For number questions: minimum passing value." },
            },
            required: ["id", "text", "type", "required"],
          },
        },
      },
      required: ["questions"],
    },
  },
  {
    name: "draft_vendor_email",
    description: "Write the cover email that goes to vendors with the RFx. Must tell vendors they may reply in any format.",
    input_schema: {
      type: "object",
      properties: { subject: { type: "string" }, body: { type: "string" } },
      required: ["subject", "body"],
    },
  },
  { name: "get_rfx", description: "Read the current RFx draft.", input_schema: { type: "object", properties: {} } },
  { name: "finalize_rfx", description: "Lock the RFx as ready to send. Fails if lines, questionnaire or email are missing.", input_schema: { type: "object", properties: {} } },
];

export type CopilotReply = { text: string; trace: TraceStep[]; rfxChanged: boolean };

export async function copilotTurn(session: DemoSession, userText: string): Promise<CopilotReply> {
  let changed = false;
  const rfx = session.rfx;
  const handlers: Record<string, (i: Record<string, unknown>) => unknown> = {
    search_item_master: (i) => {
      const q = String(i.query ?? "").toLowerCase();
      return ITEM_MASTER.filter((l) => !q || `${l.sku} ${l.description}`.toLowerCase().includes(q)).map((l) => ({
        lineId: l.lineId, sku: l.sku, description: l.description, plies: l.plies, annualQty: l.qty, targetInrPerBox: l.targetInrPerBox,
      }));
    },
    set_lines: (i) => {
      const ids = (i.lineIds as string[]).filter((id) => ITEM_MASTER.some((l) => l.lineId === id));
      if (ids.length === 0) throw new Error("No valid lineIds");
      rfx.lineIds = ids;
      rfx.qtyOverrides = (i.qtyOverrides as Record<string, number>) ?? {};
      syncLines(session);
      changed = true;
      return { lines: ids.length, annualSpendAtTargetInr: Math.round(session.lines.reduce((a, l) => a + l.qty * l.targetInrPerBox, 0)) };
    },
    set_terms: (i) => {
      if (typeof i.title === "string") rfx.title = i.title;
      if (typeof i.deliveryLocation === "string") rfx.terms.deliveryLocation = i.deliveryLocation;
      if (typeof i.paymentDays === "number") rfx.terms.paymentDays = i.paymentDays;
      if (typeof i.incoterm === "string") rfx.terms.incoterm = i.incoterm;
      if (typeof i.validityDays === "number") rfx.terms.validityDays = i.validityDays;
      if (typeof i.notes === "string") rfx.terms.notes = i.notes;
      changed = true;
      return { title: rfx.title, terms: rfx.terms };
    },
    set_questionnaire: (i) => {
      const qs = (i.questions as { id: string; text: string; type: "yesno" | "number"; required: boolean; min?: number }[]).map<QuestionDef>((q) => ({
        id: q.id, text: q.text, type: q.type, gate: { required: q.required, min: q.min },
      }));
      rfx.questionnaire = qs;
      changed = true;
      return { questions: qs.length };
    },
    draft_vendor_email: (i) => {
      rfx.email = { subject: String(i.subject), body: String(i.body) };
      changed = true;
      return "saved";
    },
    get_rfx: () => ({ ...rfx, lines: session.lines.length }),
    finalize_rfx: () => {
      const missing: string[] = [];
      if (rfx.lineIds.length === 0) missing.push("line items");
      if (rfx.questionnaire.length === 0) missing.push("questionnaire");
      if (!rfx.email) missing.push("vendor cover email");
      if (!rfx.terms.deliveryLocation) missing.push("delivery location");
      if (missing.length) throw new Error(`Cannot finalize; missing: ${missing.join(", ")}`);
      changed = true;
      return { ready: true };
    },
  };

  const history = session.copilotMessages as Anthropic.MessageParam[];
  const loop = await runToolLoop({
    system: SYSTEM,
    messages: [...history, { role: "user", content: userText }],
    tools,
    handlers,
    maxTurns: 10,
  });
  session.copilotMessages = loop.messages;
  session.copilotTranscript.push({ role: "user", text: userText }, { role: "assistant", text: loop.finalText });
  return { text: loop.finalText, trace: loop.trace, rfxChanged: changed };
}
