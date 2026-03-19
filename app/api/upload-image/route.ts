import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl, getFileSha, putFileBinary } from "@/lib/github";

const IMAGE_KEYS = ["hero", "about"] as const;
const VIDEO_KEYS = ["hero-video", "about-video"] as const;
const ALLOWED_KEYS = [...IMAGE_KEYS, ...VIDEO_KEYS] as const;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];

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
    return NextResponse.json({ error: "Fichier et key requis (hero, about, hero-video, about-video)" }, { status: 400 });
  }

  const isVideo = VIDEO_KEYS.includes(key as (typeof VIDEO_KEYS)[number]);

  if (isVideo) {
    if (!VIDEO_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Type vidéo non autorisé (MP4, WebM)" }, { status: 400 });
    }
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json({ error: "Vidéo trop volumineuse (max 50 Mo)" }, { status: 400 });
    }
    const ext = file.type === "video/webm" ? "webm" : "mp4";
    const path = `images/${key}.${ext}`;
    const bytes = await file.arrayBuffer();
    const contentBase64 = Buffer.from(bytes).toString("base64");
    const existingSha = await getFileSha(parsed.owner, parsed.repo, path);
    const ok = await putFileBinary(
      parsed.owner,
      parsed.repo,
      path,
      contentBase64,
      `Vidéo ${key} mise à jour via CMS`,
      existingSha ?? undefined
    );
    if (!ok) return NextResponse.json({ error: "Échec de l'upload" }, { status: 500 });
    return NextResponse.json({ path });
  }

  if (!IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Type d'image non autorisé (JPEG, PNG, GIF, WebP)" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "Image trop volumineuse (max 5 Mo)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext) ? ext : "jpg";
  const path = `images/${key}.${safeExt}`;
  const pathWebp = `images/${key}.webp`;
  const pathAvif = `images/${key}.avif`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const existingSha = await getFileSha(parsed.owner, parsed.repo, path);
  const okOriginal = await putFileBinary(
    parsed.owner,
    parsed.repo,
    path,
    buffer.toString("base64"),
    `Image ${key} mise à jour via CMS`,
    existingSha ?? undefined
  );
  if (!okOriginal) return NextResponse.json({ error: "Échec de l'upload" }, { status: 500 });

  let pathWebpOut: string | undefined;
  let pathAvifOut: string | undefined;
  try {
    const sharp = (await import("sharp")).default;
    const sharpInstance = sharp(buffer);
    const [webpBuf, avifBuf] = await Promise.all([
      sharpInstance.clone().webp({ quality: 82 }).toBuffer(),
      sharpInstance.clone().avif({ quality: 65 }).toBuffer(),
    ]);
    const shaWebp = await getFileSha(parsed.owner, parsed.repo, pathWebp);
    const shaAvif = await getFileSha(parsed.owner, parsed.repo, pathAvif);
    const [okWebp, okAvif] = await Promise.all([
      putFileBinary(parsed.owner, parsed.repo, pathWebp, webpBuf.toString("base64"), `Image ${key} WebP via CMS`, shaWebp ?? undefined),
      putFileBinary(parsed.owner, parsed.repo, pathAvif, avifBuf.toString("base64"), `Image ${key} AVIF via CMS`, shaAvif ?? undefined),
    ]);
    if (okWebp) pathWebpOut = pathWebp;
    if (okAvif) pathAvifOut = pathAvif;
  } catch {
    // Conversion failed; original is already saved
  }

  return NextResponse.json({ path, pathWebp: pathWebpOut, pathAvif: pathAvifOut });
}
