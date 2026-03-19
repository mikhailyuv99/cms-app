import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ ok: false });
  }
  return NextResponse.json({
    ok: true,
    siteUrl: session.siteUrl,
    name: session.name,
  });
}
