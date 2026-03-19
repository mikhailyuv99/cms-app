import { NextRequest, NextResponse } from "next/server";
import { findProjectByPassword, setSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const password = typeof body.password === "string" ? body.password : "";
  const project = findProjectByPassword(password);
  if (!project) {
    return NextResponse.json({ ok: false, error: "Mot de passe incorrect" }, { status: 401 });
  }
  await setSession(project);
  return NextResponse.json({ ok: true });
}
