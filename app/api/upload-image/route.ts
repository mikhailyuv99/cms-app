import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl, getFileSha, putFileBinary } from "@/lib/github";

const ALLOWED_KEYS = ["hero", "about"] as const;
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(request: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = parseRepoUrl(session.repo);
  if (!parsed) {
    return NextResponse.json({ error: "Repo invalide" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const key = formData.get("key") as string | null;

  if (!file || !key || !ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
    return NextResponse.json({ error: "Fichier et key (hero ou about) requis" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Type d'image non autorisé (JPEG, PNG, GIF, WebP)" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image trop volumineuse (max 5 Mo)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext) ? ext : "jpg";
  const path = `images/${key}.${safeExt}`;

  const bytes = await file.arrayBuffer();
  const contentBase64 = Buffer.from(bytes).toString("base64");
  const existingSha = await getFileSha(parsed.owner, parsed.repo, path);

  const ok = await putFileBinary(
    parsed.owner,
    parsed.repo,
    path,
    contentBase64,
    `Image ${key} mise à jour via CMS`,
    existingSha ?? undefined
  );
  if (!ok) {
    return NextResponse.json({ error: "Échec de l'upload" }, { status: 500 });
  }
  return NextResponse.json({ path });
}
