import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { viewSession } from "@/lib/view";

export async function GET() {
  return NextResponse.json(viewSession(getSession()));
}
