import rfxLines from "@/data/rfx-lines.json";
import type { DemoSession, QuestionDef, RfxDraft, RfxLine } from "./types";
import { DEFAULT_FX_USD_INR } from "./types";

/** The buyer's item master: everything the co-pilot may put on an RFx. */
export const ITEM_MASTER = rfxLines as RfxLine[];

export const DEFAULT_QUESTIONNAIRE: QuestionDef[] = [
  { id: "q_iso", text: "Is your ISO 9001 certificate current? (attach it)", type: "yesno", gate: { required: true } },
  { id: "q_brcgs", text: "Are you BRCGS Packaging Materials certified?", type: "yesno", gate: { required: true } },
  { id: "q_moisture", text: "Do you provide a moisture test report? (attach it)", type: "yesno", gate: { required: true } },
  { id: "q_audit", text: "Score of your last third-party quality audit (0–100)", type: "number", gate: { required: true, min: 80 } },
];

export function emptyRfx(): RfxDraft {
  return {
    rfxId: "CORR-2026-118",
    title: "",
    category: "Corrugated packaging",
    issuedOn: "2026-11-02",
    responseDueDate: "2026-11-11",
    lineIds: [],
    qtyOverrides: {},
    questionnaire: [],
    terms: {
      currency: "INR",
      deliveryLocation: "",
      paymentDays: 45,
      incoterm: "DAP",
      validityDays: 30,
    },
    status: "draft",
  };
}

export function linesForRfx(rfx: RfxDraft): RfxLine[] {
  return rfx.lineIds
    .map((id) => ITEM_MASTER.find((l) => l.lineId === id))
    .filter((l): l is RfxLine => !!l)
    .map((l) => ({ ...l, qty: rfx.qtyOverrides[l.lineId] ?? l.qty }));
}

export function createInitialSession(): DemoSession {
  return {
    rfx: emptyRfx(),
    lines: [],
    vendors: [],
    normalized: [],
    buyerActions: {},
    fxUsdInr: DEFAULT_FX_USD_INR,
    copilotMessages: [],
    copilotTranscript: [],
    analystTranscript: [],
  };
}

// Survive Next.js dev hot-reloads: module-level state is re-created on every HMR, a global is not.
const g = globalThis as unknown as { __quoteSession?: DemoSession };

export function getSession(): DemoSession {
  if (!g.__quoteSession) g.__quoteSession = createInitialSession();
  return g.__quoteSession;
}

export function resetSession(): DemoSession {
  g.__quoteSession = createInitialSession();
  return g.__quoteSession;
}

export function updateSession(next: DemoSession): DemoSession {
  g.__quoteSession = next;
  return next;
}

/** Re-derive lines from the RFx draft. Called whenever the co-pilot edits the draft. */
export function syncLines(session: DemoSession): DemoSession {
  session.lines = linesForRfx(session.rfx);
  return session;
}
