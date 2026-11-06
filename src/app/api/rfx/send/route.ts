import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { viewSession } from "@/lib/view";

/** SMTP is stubbed (allowed by the brief). The email text itself is model-written. */
export async function POST() {
  const s = getSession();
  if (s.lines.length === 0 || !s.rfx.email) return NextResponse.json({ error: "RFx is not ready to send" }, { status: 400 });
  s.rfx.status = "sent";
  return NextResponse.json(viewSession(s));
}
