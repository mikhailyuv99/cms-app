import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl, putFile } from "@/lib/github";

const CONTENT_PATH = "content.json";

export async function POST(request: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = parseRepoUrl(session.repo);
  if (!parsed) {
    return NextResponse.json({ error: "Repo du projet invalide" }, { status: 400 });
  }
  const body = await request.json();
  const { content, sha } = body;
  if (content === undefined || !sha) {
    return NextResponse.json({ error: "Paramètres content et sha requis" }, { status: 400 });
  }
  const contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const ok = await putFile(
    parsed.owner,
    parsed.repo,
    CONTENT_PATH,
    contentStr,
    sha,
    "Mise à jour du contenu via CMS"
  );
  if (!ok) {
    return NextResponse.json({ error: "Échec du push (vérifiez GITHUB_TOKEN et les droits sur le dépôt)" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
