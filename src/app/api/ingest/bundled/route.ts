import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getSession } from "@/lib/session-store";
import { ingestVendor, type InputFile } from "@/lib/extract";
import { rebuildNormalized } from "@/lib/normalize";
import { LlmUnavailableError } from "@/lib/llm";
import { viewSession } from "@/lib/view";

export const runtime = "nodejs";
export const maxDuration = 300;

type Entry = { id: string; name: string; files: { file: string; role: "response" | "attachment" }[] };

export async function POST(req: Request) {
  const { vendorId } = (await req.json()) as { vendorId?: string };
  const dir = path.join(process.cwd(), "public/samples/vendors");
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8")) as Entry[];
  const entry = manifest.find((m) => m.id === vendorId);
  if (!entry) return NextResponse.json({ error: `Unknown vendor ${vendorId}` }, { status: 404 });
  const session = getSession();
  if (session.lines.length === 0) return NextResponse.json({ error: "Create the RFx first" }, { status: 400 });
  try {
    const files: InputFile[] = await Promise.all(
      entry.files.map(async (f) => ({ name: f.file, role: f.role, buffer: await fs.readFile(path.join(dir, f.file)) }))
    );
    const vendor = await ingestVendor(session, { id: entry.id, name: entry.name }, files);
    session.vendors = [...session.vendors.filter((v) => v.vendorId !== entry.id), vendor];
    session.normalized = rebuildNormalized(session);
    return NextResponse.json(viewSession(session));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LlmUnavailableError ? 503 : 500 });
  }
}
