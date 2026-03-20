import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl, getFileSha, putFileBinary } from "@/lib/github";

const ALLOWED_KEYS = ["hero", "about", "videoPlay-poster"] as const;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(request: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const parsed = parseRepoUrl(session.repo);
  if (!parsed) return NextResponse.json({ error: "Repo invalide" }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const key = formData.get("key") as string | null;

  if (!file || !key || !ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
    return NextResponse.json({ error: "Fichier et key requis (hero, about, videoPlay-poster)" }, { status: 400 });
  }
  if (!IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Type non autorisé (JPEG, PNG, GIF, WebP)" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: `Image trop volumineuse (${(file.size / 1024 / 1024).toFixed(1)} Mo > 20 Mo)` }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext) ? ext : "jpg";
  const path = `images/${key}.${safeExt}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const existingSha = await getFileSha(parsed.owner, parsed.repo, path);

  const result = await putFileBinary(
    parsed.owner,
    parsed.repo,
    path,
    buffer.toString("base64"),
    `Image ${key} mise à jour via CMS`,
    existingSha ?? undefined,
  );
  if (!result.ok) return NextResponse.json({ error: "Échec de l'upload vers GitHub. Vérifiez les permissions du token." }, { status: 500 });

  const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${result.commitSha}/${path}`;

  let pathWebpOut: string | undefined;
  let pathAvifOut: string | undefined;
  try {
    const sharp = (await import("sharp")).default;
    const inst = sharp(buffer);
    const [webpBuf, avifBuf] = await Promise.all([
      inst.clone().webp({ quality: 82 }).toBuffer(),
      inst.clone().avif({ quality: 65 }).toBuffer(),
    ]);
    const pathWebp = `images/${key}.webp`;
    const pathAvif = `images/${key}.avif`;
    const [shaWebp, shaAvif] = await Promise.all([
      getFileSha(parsed.owner, parsed.repo, pathWebp),
      getFileSha(parsed.owner, parsed.repo, pathAvif),
    ]);
    const [resWebp, resAvif] = await Promise.all([
      putFileBinary(parsed.owner, parsed.repo, pathWebp, webpBuf.toString("base64"), `Image ${key} WebP via CMS`, shaWebp ?? undefined),
      putFileBinary(parsed.owner, parsed.repo, pathAvif, avifBuf.toString("base64"), `Image ${key} AVIF via CMS`, shaAvif ?? undefined),
    ]);
    if (resWebp.ok) pathWebpOut = pathWebp;
    if (resAvif.ok) pathAvifOut = pathAvif;
  } catch {
    // WebP/AVIF failed — original is already saved
  }

  return NextResponse.json({ path, rawUrl, pathWebp: pathWebpOut, pathAvif: pathAvifOut });
}
