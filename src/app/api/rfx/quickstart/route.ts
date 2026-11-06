import { NextResponse } from "next/server";
import { getSession, ITEM_MASTER, DEFAULT_QUESTIONNAIRE, syncLines } from "@/lib/session-store";
import { viewSession } from "@/lib/view";

/**
 * Escape hatch for a flaky venue network: fills the RFx from a fixed template WITHOUT the co-pilot.
 * Clearly labelled in the UI. Everything downstream (extraction, analyst) is unaffected and still real.
 */
export async function POST() {
  const s = getSession();
  s.rfx.title = "Corrugated packaging programme — Bangalore DC (30 SKUs)";
  s.rfx.lineIds = ITEM_MASTER.map((l) => l.lineId);
  s.rfx.qtyOverrides = {};
  s.rfx.questionnaire = DEFAULT_QUESTIONNAIRE;
  s.rfx.terms = { currency: "INR", deliveryLocation: "Bangalore DC", paymentDays: 45, incoterm: "DAP", validityDays: 30 };
  s.rfx.email = {
    subject: `RFx ${s.rfx.rfxId}: corrugated packaging, 30 lines, Bangalore DC`,
    body: "Hello,\n\nPlease quote the attached 30 corrugated packaging lines for delivery to our Bangalore DC. Reply in whatever format is easiest for you (Excel, PDF, Word, a photo of your rate card, or just an email). You do not need to use our template. Please state unit, currency, freight and GST treatment, and answer the four quality questions (ISO 9001, BRCGS, moisture report, last audit score) with the supporting certificates attached.\n\nResponse due 11 Nov 2026.\n\nThank you.",
  };
  syncLines(s);
  return NextResponse.json(viewSession(s));
}
