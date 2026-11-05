import { NextResponse } from "next/server";
import { ingestFromPublicSample } from "@/lib/extract";
import { rebuildNormalized } from "@/lib/normalize";
import { getSession, updateSession } from "@/lib/session-store";

const VENDOR_IDS = ["packright", "global", "southern", "desipack", "quickpack"];

export async function POST() {
  const base = getSession();
  const vendors = [];
  for (const id of VENDOR_IDS) {
    vendors.push(await ingestFromPublicSample(id, base.lines, base.lastYearInr));
  }
  const next = { ...base, vendors, normalized: [] as ReturnType<typeof rebuildNormalized> };
  next.normalized = rebuildNormalized(next);
  updateSession(next);
  return NextResponse.json(next);
}
