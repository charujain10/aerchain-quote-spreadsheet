import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export type Provider = "gemini" | "anthropic";

/** Explicit LLM_PROVIDER wins; otherwise whichever key is present (Gemini first: it has a free tier). */
export function provider(): Provider | null {
  const forced = process.env.LLM_PROVIDER;
  if (forced === "gemini" || forced === "anthropic") return forced;
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function modelName(): string {
  return provider() === "anthropic"
    ? process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"
    : process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

export class LlmUnavailableError extends Error {
  constructor() {
    super(
      "No model API key is set. This app has no fake mode: the co-pilot, extraction and analyst all call a real model. Put GEMINI_API_KEY (free at aistudio.google.com) or ANTHROPIC_API_KEY in .env.local and restart."
    );
  }
}

export function llmConfigured(): boolean {
  return provider() !== null;
}

let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenAI | null = null;

function anthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}
function gemini(): GoogleGenAI {
  if (!geminiClient) {
    const base = process.env.GEMINI_BASE_URL; // test harness only
    geminiClient = new GoogleGenAI({
      apiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) as string,
      ...(base ? { httpOptions: { baseUrl: base } } : {}),
    });
  }
  return geminiClient;
}

type Json = Record<string, unknown>;
export type ToolDef = { name: string; description: string; input_schema: Json };
export type ToolHandler = (input: Json, ctx: { callId: string }) => unknown | Promise<unknown>;

export type TraceStep = { tool: string; input: Json; summary: string; ok: boolean };

export type LoopResult = {
  messages: Anthropic.MessageParam[];
  finalText: string;
  trace: TraceStep[];
  stoppedBy: "end_turn" | "terminal_tool" | "max_turns";
  usage: { input: number; output: number };
};


// ───────────────────────── provider-neutral call ─────────────────────────
// Internally every message is Anthropic-shaped (text / image / document / tool_use / tool_result
// blocks). The Gemini branch translates to and from that shape, so the rest of the app is provider-agnostic.

export type LlmResponse = {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
};

type CallParams = {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: ToolDef[];
  forceTool?: string;
  maxTokens: number;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Free tiers rate-limit hard. Wait out 429/503 with the server's own hint when it gives one. */
async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const err = e as { status?: number; message?: string };
      const retryable = err.status === 429 || err.status === 503 || err.status === 500;
      if (!retryable || i >= tries - 1) {
        if (err.status === 429) throw new Error(`Model rate limit / free-tier quota reached. Wait a minute and retry (or check your quota in Google AI Studio). Detail: ${(err.message ?? "").slice(0, 200)}`);
        throw e;
      }
      const hint = /retry(?:Delay)?\D{0,12}(\d+(?:\.\d+)?)\s*s/i.exec(err.message ?? "");
      await sleep(Math.min(60000, hint ? Math.ceil(parseFloat(hint[1]) * 1000) + 500 : 4000 * 2 ** i));
    }
  }
}

function geminiContents(messages: Anthropic.MessageParam[]) {
  const nameById = new Map<string, string>();
  return messages.map((m) => {
    const blocks: Anthropic.ContentBlockParam[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    const parts: Record<string, unknown>[] = [];
    for (const b of blocks as (Anthropic.ContentBlockParam & { thoughtSignature?: string })[]) {
      const sig = b.thoughtSignature ? { thoughtSignature: b.thoughtSignature } : {};
      if (b.type === "text") parts.push({ text: b.text, ...sig });
      else if (b.type === "image" && b.source.type === "base64") parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
      else if (b.type === "document" && b.source.type === "base64") parts.push({ inlineData: { mimeType: "application/pdf", data: b.source.data } });
      else if (b.type === "tool_use") {
        nameById.set(b.id, b.name);
        parts.push({ functionCall: { ...(b.id.startsWith("gem_") ? {} : { id: b.id }), name: b.name, args: b.input }, ...sig });
      } else if (b.type === "tool_result") {
        let value: unknown = b.content;
        if (typeof value === "string") {
          try { value = JSON.parse(value); } catch { /* keep string */ }
        }
        parts.push({
          functionResponse: {
            ...(b.tool_use_id.startsWith("gem_") ? {} : { id: b.tool_use_id }),
            name: nameById.get(b.tool_use_id) ?? "tool",
            response: b.is_error ? { error: value } : { result: value },
          },
        });
      }
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
}

let geminiCallSeq = 0;

async function callGemini(p: CallParams): Promise<LlmResponse> {
  const res = await withRetry(() =>
    gemini().models.generateContent({
      model: modelName(),
      contents: geminiContents(p.messages) as never,
      config: {
        systemInstruction: p.system,
        maxOutputTokens: p.maxTokens,
        tools: [{ functionDeclarations: p.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })) }],
        ...(p.forceTool ? { toolConfig: { functionCallingConfig: { mode: "ANY" as never, allowedFunctionNames: [p.forceTool] } } } : {}),
      },
    })
  );
  const cand = res.candidates?.[0];
  if (!cand?.content?.parts) {
    throw new Error(`Gemini returned no content (finishReason=${cand?.finishReason ?? "none"}, blockReason=${res.promptFeedback?.blockReason ?? "none"})`);
  }
  const content: Anthropic.ContentBlock[] = [];
  for (const part of cand.content.parts) {
    if (part.thought) continue;
    const sig = part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {};
    if (part.functionCall) {
      content.push({ type: "tool_use", id: part.functionCall.id ?? `gem_${++geminiCallSeq}`, name: part.functionCall.name ?? "", input: part.functionCall.args ?? {}, ...sig } as unknown as Anthropic.ToolUseBlock);
    } else if (typeof part.text === "string") {
      content.push({ type: "text", text: part.text, citations: null, ...sig } as unknown as Anthropic.TextBlock);
    }
  }
  const hasCall = content.some((b) => b.type === "tool_use");
  const finish = String(cand.finishReason ?? "");
  return {
    content,
    stop_reason: hasCall ? "tool_use" : finish === "MAX_TOKENS" ? "max_tokens" : "end_turn",
    usage: { input_tokens: res.usageMetadata?.promptTokenCount ?? 0, output_tokens: res.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}

async function callAnthropic(p: CallParams): Promise<LlmResponse> {
  const res = await anthropic().messages.create({
    model: modelName(),
    max_tokens: p.maxTokens,
    system: p.system,
    tools: p.tools as Anthropic.Tool[],
    ...(p.forceTool ? { tool_choice: { type: "tool" as const, name: p.forceTool } } : {}),
    messages: p.messages,
  });
  return { content: res.content, stop_reason: res.stop_reason, usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } };
}

async function createMessage(p: CallParams): Promise<LlmResponse> {
  const which = provider();
  if (!which) throw new LlmUnavailableError();
  return which === "gemini" ? callGemini(p) : callAnthropic(p);
}

function summarize(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}

/**
 * Plain tool-use loop. The model plans and calls tools; every number it can cite comes from a
 * tool result, because the handlers (not the model) do the arithmetic.
 */
export async function runToolLoop(opts: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: ToolDef[];
  handlers: Record<string, ToolHandler>;
  /** Tools that end the loop once executed (e.g. `present`). */
  terminalTools?: string[];
  maxTurns?: number;
  maxTokens?: number;
}): Promise<LoopResult> {
  const messages = [...opts.messages];
  const trace: TraceStep[] = [];
  const usage = { input: 0, output: 0 };
  let finalText = "";
  const max = opts.maxTurns ?? 10;

  for (let turn = 0; turn < max; turn++) {
    const res = await createMessage({ system: opts.system, messages, tools: opts.tools, maxTokens: opts.maxTokens ?? 8192 });
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });

    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    finalText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (uses.length === 0) return { messages, finalText, trace, stoppedBy: "end_turn", usage };

    const results: Anthropic.ToolResultBlockParam[] = [];
    let terminal = false;
    for (const u of uses) {
      const handler = opts.handlers[u.name];
      let content: string;
      let ok = true;
      try {
        if (!handler) throw new Error(`Unknown tool ${u.name}`);
        const out = await handler(u.input as Json, { callId: u.id });
        content = typeof out === "string" ? out : JSON.stringify(out);
        trace.push({ tool: u.name, input: u.input as Json, summary: summarize(out), ok });
      } catch (e) {
        ok = false;
        content = `Error: ${(e as Error).message}`;
        trace.push({ tool: u.name, input: u.input as Json, summary: content, ok });
      }
      if (ok && opts.terminalTools?.includes(u.name)) terminal = true;
      results.push({ type: "tool_result", tool_use_id: u.id, content, is_error: !ok });
    }
    messages.push({ role: "user", content: results });
    if (terminal) return { messages, finalText, trace, stoppedBy: "terminal_tool", usage };
  }
  return { messages, finalText, trace, stoppedBy: "max_turns", usage };
}

/** One forced tool call → validated structured output. Used for extraction. */
export async function forcedToolCall(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  tool: ToolDef;
  maxTokens?: number;
}): Promise<{ input: unknown; usage: { input: number; output: number }; stopReason: string | null }> {
  const res = await createMessage({
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    tools: [opts.tool],
    forceTool: opts.tool.name,
    maxTokens: opts.maxTokens ?? 16000,
  });
  const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!use) throw new Error("Model returned no structured output");
  return { input: use.input, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens }, stopReason: res.stop_reason };
}

// ── Disk cache: first run is a real model call; re-runs of the same file are free and repeatable ──

const CACHE_DIR = path.join(process.cwd(), ".cache", "extract");

export function cacheKey(parts: (string | Buffer)[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 32);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${key}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function cachePut(key: string, value: unknown): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value));
  } catch {
    /* cache is best-effort */
  }
}
