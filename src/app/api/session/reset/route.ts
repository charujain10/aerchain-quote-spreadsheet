import { NextResponse } from "next/server";
import { resetSession } from "@/lib/session-store";

export async function POST() {
  return NextResponse.json(resetSession());
}
