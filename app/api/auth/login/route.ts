import { NextRequest, NextResponse } from "next/server";
import { checkPassword, setSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const password = typeof body.password === "string" ? body.password : "";
  if (!checkPassword(password)) {
    return NextResponse.json({ ok: false, error: "Mot de passe incorrect" }, { status: 401 });
  }
  await setSession();
  return NextResponse.json({ ok: true });
}
