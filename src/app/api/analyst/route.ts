import { NextResponse } from "next/server";
import { askAnalyst } from "@/lib/analyst/agent";
import { getSession } from "@/lib/session-store";
import { LlmUnavailableError } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 });
  const session = getSession();
  if (session.vendors.length === 0) return NextResponse.json({ error: "Ingest vendor responses first" }, { status: 400 });
  try {
    return NextResponse.json(await askAnalyst(session, question.trim()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailableError ? 503 : 500 });
  }
}
