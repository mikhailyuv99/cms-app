const TARGET_MB = 95;
const MAX_SIZE = 100 * 1024 * 1024;

let ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg | null = null;
let loaded = false;

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (video.duration && isFinite(video.duration)) resolve(video.duration);
      else reject(new Error("Durée vidéo indéterminée"));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire la vidéo"));
    };
    video.src = url;
  });
}

async function ensureFFmpeg(
  onLog?: (msg: string) => void,
): Promise<import("@ffmpeg/ffmpeg").FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;

  onLog?.("Chargement du moteur de compression…");

  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");

  ffmpeg = new FFmpeg();

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.wasm`,
      "application/wasm",
    ),
  });

  loaded = true;
  return ffmpeg;
}

export function needsCompression(file: File): boolean {
  return file.size > MAX_SIZE;
}

export async function compressVideo(
  file: File,
  onProgress?: (ratio: number) => void,
  onLog?: (msg: string) => void,
): Promise<File> {
  const ff = await ensureFFmpeg(onLog);

  ff.on("progress", ({ progress }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  });

  onLog?.("Analyse de la vidéo…");
  const duration = await getVideoDuration(file);

  const { fetchFile } = await import("@ffmpeg/util");

  onLog?.("Préparation…");
  const inputName = file.type === "video/webm" ? "input.webm" : "input.mp4";
  await ff.writeFile(inputName, await fetchFile(file));

  const targetBits = TARGET_MB * 8 * 1024 * 1024;
  const audioBitrateK = 128;
  const videoBitrateK = Math.max(
    500,
    Math.floor(targetBits / duration / 1024 - audioBitrateK),
  );

  onLog?.(
    `Compression en cours (cible ≈ ${TARGET_MB} Mo, ${videoBitrateK} kbps)…`,
  );

  await ff.exec([
    "-i",
    inputName,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-vf",
    "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
    "-b:v",
    `${videoBitrateK}k`,
    "-maxrate",
    `${Math.floor(videoBitrateK * 1.5)}k`,
    "-bufsize",
    `${Math.floor(videoBitrateK * 2)}k`,
    "-c:a",
    "aac",
    "-b:a",
    `${audioBitrateK}k`,
    "-movflags",
    "+faststart",
    "-y",
    "output.mp4",
  ]);

  const data = await ff.readFile("output.mp4");

  await ff.deleteFile(inputName).catch(() => {});
  await ff.deleteFile("output.mp4").catch(() => {});

  const bytes = data as Uint8Array;
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: "video/mp4" });
  const result = new File([blob], file.name.replace(/\.\w+$/, ".mp4"), {
    type: "video/mp4",
  });

  const sizeMB = (result.size / 1024 / 1024).toFixed(1);
  onLog?.(`Compression terminée — ${sizeMB} Mo`);

  if (result.size > MAX_SIZE) {
    throw new Error(
      `La vidéo compressée fait encore ${sizeMB} Mo. Réduisez la durée ou la résolution de la vidéo.`,
    );
  }

  return result;
}
