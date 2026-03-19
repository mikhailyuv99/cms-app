import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl, getFileContent } from "@/lib/github";

const CONTENT_PATH = "content.json";

export async function GET(request: NextRequest) {
  if (!getSession()) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const repoInput = request.nextUrl.searchParams.get("repo");
  if (!repoInput) {
    return NextResponse.json({ error: "Paramètre repo manquant" }, { status: 400 });
  }
  const parsed = parseRepoUrl(repoInput);
  if (!parsed) {
    return NextResponse.json({ error: "URL du repo GitHub invalide" }, { status: 400 });
  }
  const file = await getFileContent(parsed.owner, parsed.repo, CONTENT_PATH);
  if (!file) {
    return NextResponse.json({ error: "content.json introuvable dans ce dépôt" }, { status: 404 });
  }
  let data: unknown;
  try {
    data = JSON.parse(file.content);
  } catch {
    return NextResponse.json({ error: "content.json invalide" }, { status: 400 });
  }
  return NextResponse.json({ content: data, sha: file.sha });
}
