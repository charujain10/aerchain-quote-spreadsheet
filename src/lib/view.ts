import type { DemoSession } from "./types";
import { allGates } from "./qualify";
import { llmConfigured, modelName, provider } from "./llm";

/** What the browser sees: no raw model transcripts or full source text. */
export function viewSession(s: DemoSession) {
  return {
    rfx: s.rfx,
    lines: s.lines,
    vendors: s.vendors.map((v) => ({ ...v, sourceText: undefined })),
    normalized: s.normalized,
    gates: allGates(s),
    fxUsdInr: s.fxUsdInr,
    copilotTranscript: s.copilotTranscript,
    analystTranscript: s.analystTranscript,
    llm: { configured: llmConfigured(), provider: provider(), model: modelName() },
  };
}
export type SessionView = ReturnType<typeof viewSession>;
