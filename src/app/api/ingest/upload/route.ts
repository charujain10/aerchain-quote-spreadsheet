import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { ingestVendor, type InputFile } from "@/lib/extract";
import { rebuildNormalized } from "@/lib/normalize";
import { LlmUnavailableError } from "@/lib/llm";
import { viewSession } from "@/lib/view";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Upload any vendor reply: first file is the response, the rest are attachments. */
export async function POST(req: Request) {
  const form = await req.formData();
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  const vendorName = String(form.get("vendorName") ?? "").trim() || "Uploaded vendor";
  if (uploads.length === 0) return NextResponse.json({ error: "at least one file required" }, { status: 400 });
  const session = getSession();
  if (session.lines.length === 0) return NextResponse.json({ error: "Create the RFx first" }, { status: 400 });
  try {
    const files: InputFile[] = await Promise.all(
      uploads.map(async (f, i) => ({ name: f.name, role: i === 0 ? ("response" as const) : ("attachment" as const), buffer: Buffer.from(await f.arrayBuffer()) }))
    );
    const id = vendorName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vendor";
    const vendor = await ingestVendor(session, { id, name: vendorName }, files);
    session.vendors = [...session.vendors.filter((v) => v.vendorId !== id), vendor];
    session.normalized = rebuildNormalized(session);
    return NextResponse.json(viewSession(session));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailableError ? 503 : 500 });
  }
}
