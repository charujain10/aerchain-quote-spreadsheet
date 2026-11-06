import { NextResponse } from "next/server";
import { copilotTurn } from "@/lib/copilot";
import { getSession } from "@/lib/session-store";
import { LlmUnavailableError } from "@/lib/llm";
import { viewSession } from "@/lib/view";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { message } = (await req.json()) as { message?: string };
  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });
  try {
    const session = getSession();
    const reply = await copilotTurn(session, message.trim());
    return NextResponse.json({ reply, session: viewSession(session) });
  } catch (e) {
    const status = e instanceof LlmUnavailableError ? 503 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
