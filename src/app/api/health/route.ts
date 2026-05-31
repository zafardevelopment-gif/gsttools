import { NextResponse } from "next/server";

/** Liveness probe. Public route (see proxy PUBLIC_PATHS). */
export function GET() {
  return NextResponse.json({ status: "ok", service: "gst-billing", ts: Date.now() });
}
