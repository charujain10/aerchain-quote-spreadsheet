import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export async function GET() {
  return NextResponse.json(getSession());
}
