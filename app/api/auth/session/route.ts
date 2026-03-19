import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const ok = getSession();
  return NextResponse.json({ ok });
}
