import { NextResponse } from "next/server";
import { comparisonMatrixCsv, questionnaireCsv, splitAwardCsv } from "@/lib/export/csv";
import { getSession } from "@/lib/session-store";

export async function GET(req: Request) {
  const session = getSession();
  if (session.vendors.length === 0) {
    return NextResponse.json({ error: "Ingest vendor responses before export" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "comparison";
  const qualified = searchParams.get("qualified") !== "false";

  let body = "";
  let filename = "export.csv";
  if (type === "questionnaire") {
    body = questionnaireCsv(session);
    filename = "questionnaire-summary.csv";
  } else if (type === "split-award") {
    body = splitAwardCsv(session, qualified);
    filename = qualified ? "split-award-qualified.csv" : "split-award-all-vendors.csv";
  } else {
    body = comparisonMatrixCsv(session);
    filename = "comparison-matrix.csv";
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
