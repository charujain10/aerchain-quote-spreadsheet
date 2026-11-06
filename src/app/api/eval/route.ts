import { NextResponse } from "next/server";
import { evaluate } from "@/lib/eval";
import { getSession } from "@/lib/session-store";

export async function GET() {
  const s = getSession();
  if (s.vendors.length === 0) return NextResponse.json({ error: "Ingest vendor responses first" }, { status: 400 });
  return NextResponse.json(evaluate(s));
}
