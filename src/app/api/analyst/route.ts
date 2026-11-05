import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/analyst/engine";
import { getSession } from "@/lib/session-store";

export async function POST(req: Request) {
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  const session = getSession();
  if (session.vendors.length === 0) {
    return NextResponse.json({ error: "Ingest vendor responses first" }, { status: 400 });
  }
  const results = answerQuestion(session, question);
  return NextResponse.json({ results });
}
