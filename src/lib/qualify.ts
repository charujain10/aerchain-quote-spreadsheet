import type { DemoSession, DocType, ExtractedDoc, QuestionDef, VendorResponse } from "./types";

export type QuestionVerdict = {
  questionId: string;
  text: string;
  answer: string;
  verdict: "pass" | "fail" | "unknown" | "conflict";
  evidence?: string;
  note?: string;
};

export type VendorGate = {
  vendorId: string;
  status: "cleared" | "failed" | "conflict" | "unverified";
  questions: QuestionVerdict[];
  reasons: string[];
};

const DOC_FOR_QUESTION: Record<string, DocType> = {
  q_iso: "iso_9001_certificate",
  q_brcgs: "brcgs_certificate",
  q_moisture: "moisture_test_report",
  q_audit: "audit_report",
};

function expiredDoc(docs: ExtractedDoc[], q: QuestionDef, asOf: string): ExtractedDoc | undefined {
  const type = DOC_FOR_QUESTION[q.id];
  if (!type) return undefined;
  return docs.find((d) => d.docType === type && d.validUntil && d.validUntil < asOf);
}

export function evaluateGate(session: DemoSession, vendor: VendorResponse): VendorGate {
  const { questionnaire, responseDueDate } = session.rfx;
  const { answers, documents } = vendor.extraction;
  const questions: QuestionVerdict[] = [];

  for (const q of questionnaire) {
    const a = answers.find((x) => x.questionId === q.id);
    const ans = a?.answer ?? "not_stated";
    let verdict: QuestionVerdict["verdict"];
    let note: string | undefined;

    if (ans === "not_stated") verdict = "unknown";
    else if (q.type === "yesno") verdict = ans === "yes" ? "pass" : "fail";
    else if (typeof ans === "number") verdict = q.gate.min != null && ans < q.gate.min ? "fail" : "pass";
    else verdict = "unknown";

    // Claims are not evidence: an attached certificate that contradicts the answer wins.
    const expired = expiredDoc(documents, q, responseDueDate);
    if (verdict === "pass" && expired) {
      verdict = "conflict";
      note = `Answer says yes, but attached “${expired.fileName}” expired on ${expired.validUntil}`;
    }
    if (!q.gate.required && verdict === "fail") verdict = "pass";

    questions.push({
      questionId: q.id,
      text: q.text,
      answer: ans === "not_stated" ? "not stated" : String(ans),
      verdict,
      evidence: a?.evidence,
      note,
    });
  }

  const reasons = questions
    .filter((q) => q.verdict !== "pass")
    .map((q) => `${q.text.split("(")[0].trim()}: ${q.verdict}${q.note ? ` — ${q.note}` : ""}`);

  let status: VendorGate["status"] = "cleared";
  if (questions.some((q) => q.verdict === "fail")) status = "failed";
  else if (questions.some((q) => q.verdict === "conflict")) status = "conflict";
  else if (questions.some((q) => q.verdict === "unknown")) status = "unverified";

  return { vendorId: vendor.vendorId, status, questions, reasons };
}

export function allGates(session: DemoSession): VendorGate[] {
  return session.vendors.map((v) => evaluateGate(session, v));
}
