import { NextResponse } from "next/server";
import { resetSession } from "@/lib/session-store";
import { viewSession } from "@/lib/view";

export async function POST() {
  return NextResponse.json(viewSession(resetSession()));
}
