import { NextResponse } from "next/server";
import { awardCsv, comparisonCsv, questionnaireCsv } from "@/lib/export/csv";
import { getSession } from "@/lib/session-store";

export async function GET(req: Request) {
  const s = getSession();
  if (s.vendors.length === 0) return NextResponse.json({ error: "Ingest vendor responses before export" }, { status: 400 });
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") ?? "comparison";
  let body: string;
  let filename: string;
  if (type === "questionnaire") {
    body = questionnaireCsv(s);
    filename = "questionnaire-verdicts.csv";
  } else if (type === "award") {
    const qualified = sp.get("qualified") !== "false";
    body = awardCsv(s, { strategy: "split", qualifiedOnly: qualified });
    filename = qualified ? "award-split-qualified.csv" : "award-split-all-vendors.csv";
  } else {
    body = comparisonCsv(s);
    filename = "comparison-matrix.csv";
  }
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
