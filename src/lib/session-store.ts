import rfxLines from "@/data/rfx-lines.json";
import type { DemoSession, RfxLine } from "./types";

const lines = rfxLines as RfxLine[];

export function createInitialSession(): DemoSession {
  const lastYearInr: Record<string, number> = {};
  for (const l of lines) {
    lastYearInr[l.lineId] = Math.round(l.targetInrPerBox * 1.02 * 100) / 100;
  }
  return {
    rfxId: "CORR-2026-118",
    title: "Corrugated packaging program — Bangalore DC (30 SKUs)",
    lines,
    vendors: [],
    normalized: [],
    lastYearInr,
  };
}

let session: DemoSession = createInitialSession();

export function getSession(): DemoSession {
  return session;
}

export function resetSession(): DemoSession {
  session = createInitialSession();
  return session;
}

export function updateSession(next: DemoSession): DemoSession {
  session = next;
  return session;
}

export const COPILOT_SEED_PROMPT =
  "Need 30-line corrugated RFx for Bangalore DC: beverage trays, e-com shippers, export cartons. Include quality questionnaire (ISO, BRCGS, moisture, audit score).";

export const COPILOT_REPLY =
  "Draft RFx CORR-2026-118 is ready: 30 SKUs with specs, annual qty, target currency INR, and supplier questionnaire. You can edit lines or send to vendors.";

export type CopilotTurn = { role: "buyer" | "copilot"; text: string };

export const COPILOT_TURNS: CopilotTurn[] = [
  { role: "buyer", text: COPILOT_SEED_PROMPT },
  {
    role: "copilot",
    text: "Understood. Confirming: currency INR, Bangalore DC delivery, quality gate for award scenarios — ISO 9001, BRCGS food-grade liner, moisture test report, audit score ≥ 80. Standard terms 45-day payment?",
  },
  {
    role: "buyer",
    text: "Yes — INR, that quality gate, 45-day payment. Add annual qty estimates per SKU; we expect messy quotes back (Excel, PDF, email).",
  },
  {
    role: "copilot",
    text: `${COPILOT_REPLY} Payment 45 days. Questionnaire embedded in RFx pack. Ready to send to shortlisted vendors.`,
  },
];

export const RFx_QUESTIONNAIRE_TERMS = [
  "ISO 9001 certified",
  "BRCGS food-grade liner (where applicable)",
  "Moisture test report provided",
  "Last audit score ≥ 80 for split-award eligibility",
];
