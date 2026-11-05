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
