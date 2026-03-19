import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl, putFile } from "@/lib/github";

const CONTENT_PATH = "content.json";

export async function POST(request: NextRequest) {
  if (!getSession()) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const body = await request.json();
  const { repo: repoInput, content, sha } = body;
  if (!repoInput || content === undefined || !sha) {
    return NextResponse.json({ error: "Paramètres repo, content et sha requis" }, { status: 400 });
  }
  const parsed = parseRepoUrl(repoInput);
  if (!parsed) {
    return NextResponse.json({ error: "URL du repo GitHub invalide" }, { status: 400 });
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
