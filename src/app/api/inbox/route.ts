import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET() {
  const p = path.join(process.cwd(), "public/samples/vendors/manifest.json");
  return NextResponse.json(JSON.parse(await fs.readFile(p, "utf8")));
}
