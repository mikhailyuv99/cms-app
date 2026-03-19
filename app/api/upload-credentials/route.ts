import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl } from "@/lib/github";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = parseRepoUrl(session.repo);
  if (!parsed) {
    return NextResponse.json({ error: "Repo invalide" }, { status: 400 });
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "GITHUB_TOKEN non configuré" }, { status: 500 });
  }
  return NextResponse.json({ token, owner: parsed.owner, repo: parsed.repo });
}
