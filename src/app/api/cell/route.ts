import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { rebuildNormalized } from "@/lib/normalize";
import { viewSession } from "@/lib/view";
import type { Flag } from "@/lib/types";

type Body =
  | { action: "confirm" | "override"; vendorId: string; lineId: string; price?: number }
  | { action: "undo"; vendorId: string; lineId: string }
  | { action: "confirm_group"; vendorId: string; flag: Flag }
  | { action: "set_fx"; fxUsdInr: number };

/** Buyer-in-the-loop: confirm, override or reset cells; confirm every cell sharing an interpretation; edit the FX assumption. */
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const s = getSession();
  if (body.action === "set_fx") {
    if (!(body.fxUsdInr > 0)) return NextResponse.json({ error: "invalid rate" }, { status: 400 });
    s.fxUsdInr = body.fxUsdInr;
  } else if (body.action === "confirm_group") {
    for (const c of s.normalized.filter((c) => c.vendorId === body.vendorId && c.status === "review" && c.flags.includes(body.flag))) {
      s.buyerActions[`${c.vendorId}:${c.lineId}`] = { action: "confirmed" };
    }
  } else {
    const key = `${body.vendorId}:${body.lineId}`;
    if (body.action === "undo") delete s.buyerActions[key];
    else if (body.action === "confirm") s.buyerActions[key] = { action: "confirmed" };
    else if (body.action === "override") {
      if (!(typeof body.price === "number" && body.price > 0)) return NextResponse.json({ error: "price required" }, { status: 400 });
      s.buyerActions[key] = { action: "overridden", price: body.price };
    }
  }
  s.normalized = rebuildNormalized(s);
  return NextResponse.json(viewSession(s));
}
