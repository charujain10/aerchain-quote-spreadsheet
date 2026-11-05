import { NextResponse } from "next/server";
import { ingestVendorFile } from "@/lib/extract";
import { rebuildNormalized } from "@/lib/normalize";
import { getSession, updateSession } from "@/lib/session-store";
import type { VendorMeta } from "@/lib/types";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const vendorId = String(form.get("vendorId") ?? "custom");
  const vendorName = String(form.get("vendorName") ?? "Custom vendor");
  const currency = (String(form.get("currency") ?? "INR") === "USD" ? "USD" : "INR") as "INR" | "USD";
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const session = getSession();
  const buffer = Buffer.from(await file.arrayBuffer());
  const meta: VendorMeta = { id: vendorId, name: vendorName, currency };
  const vendor = await ingestVendorFile(meta, file.name, buffer, session.lines, session.lastYearInr);
  const vendors = [...session.vendors.filter((v) => v.vendorId !== vendorId), vendor];
  const next = { ...session, vendors, normalized: rebuildNormalized({ ...session, vendors }) };
  updateSession(next);
  return NextResponse.json({ vendor, session: next });
}
