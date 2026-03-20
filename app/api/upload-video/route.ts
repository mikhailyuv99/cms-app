import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl, getFileSha, putFileBinary } from "@/lib/github";

const ALLOWED_KEYS = ["hero-video", "about-video", "videoLoop-video", "videoPlay-video"] as const;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm"];

export async function POST(request: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const parsed = parseRepoUrl(session.repo);
  if (!parsed) return NextResponse.json({ error: "Repo invalide" }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const key = formData.get("key") as string | null;

  if (!file || !key || !ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
    return NextResponse.json({ error: "Fichier et key requis" }, { status: 400 });
  }
  if (!VIDEO_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Type non autorisé (MP4, WebM)" }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_SIZE) {
    return NextResponse.json({ error: `Vidéo trop volumineuse (${(file.size / 1024 / 1024).toFixed(0)} Mo > 100 Mo)` }, { status: 400 });
  }

  const ext = file.type === "video/webm" ? "webm" : "mp4";
  const path = `images/${key}.${ext}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const existingSha = await getFileSha(parsed.owner, parsed.repo, path);

  const result = await putFileBinary(
    parsed.owner,
    parsed.repo,
    path,
    buffer.toString("base64"),
    `Vidéo ${key} mise à jour via CMS`,
    existingSha ?? undefined,
  );
  if (!result.ok) {
    return NextResponse.json({ error: "Échec de l'upload vers GitHub. Vérifiez les permissions du token." }, { status: 500 });
  }

  const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${result.commitSha}/${path}`;

  return NextResponse.json({ path, rawUrl });
}
