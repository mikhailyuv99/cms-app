"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getPageOrder,
  isMultiPage,
  type ContentData,
  type ContentFile,
} from "@/lib/content-types";
import { absolutizeContentMediaForEmbed } from "@/lib/resolve-site-media-urls";

const MAX_HISTORY = 80;

function trimSiteUrl(u: string) {
  return u.replace(/\/$/, "");
}

function cloneContent(c: ContentFile): ContentFile {
  return JSON.parse(JSON.stringify(c));
}

function normalizeOrigin(o: string): string {
  try {
    const u = new URL(o);
    const host = u.hostname === "127.0.0.1" ? "localhost" : u.hostname;
    return `${u.protocol}//${host}${u.port ? ":" + u.port : ""}`;
  } catch {
    return o;
  }
}

function mergePatchIntoPage(page: ContentData, patch: Record<string, unknown>): ContentData {
  const next = { ...page };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === undefined) continue;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const prev = (next as Record<string, unknown>)[k];
      (next as Record<string, unknown>)[k] = {
        ...(prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as object) : {}),
        ...(v as object),
      };
    } else {
      (next as Record<string, unknown>)[k] = v;
    }
  }
  return next;
}

function mergePatchIntoContentFile(
  file: ContentFile,
  patch: Record<string, unknown>,
  pageSlug: string | undefined,
): ContentFile {
  if (!isMultiPage(file)) {
    return mergePatchIntoPage(file as ContentData, patch);
  }
  const slug =
    pageSlug && file.pages[pageSlug] !== undefined
      ? pageSlug
      : getPageOrder(file)[0] ?? "index";
  const prevPage = file.pages[slug] ?? {};
  return {
    ...file,
    pages: { ...file.pages, [slug]: mergePatchIntoPage(prevPage, patch) },
  };
}

function pageLabel(slug: string): string {
  const labels: Record<string, string> = { index: "Accueil" };
  return labels[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

function FullScreenLoading({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[var(--cms-bg)]">
      <div className="h-10 w-10 rounded-full border-2 border-[var(--cms-border)] border-t-white animate-spin" />
      <p className="text-sm text-[var(--cms-text-muted)]">{message}</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ siteUrl?: string; name?: string } | null | false>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [content, setContent] = useState<ContentFile | null>(null);
  const [currentPageSlug, setCurrentPageSlug] = useState<string>("index");
  const [history, setHistory] = useState<ContentFile[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sha, setSha] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionLog, setCompressionLog] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState<string | null>(null);
  const [liveIframeKey, setLiveIframeKey] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [iframeSyncTick, setIframeSyncTick] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** Maps relative file paths to preview URLs (raw GitHub) for instant display after upload */
  const previewOverridesRef = useRef(new Map<string, string>());

  const contentRef = useRef(content);
  contentRef.current = content;
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;
  const currentPageSlugRef = useRef(currentPageSlug);
  currentPageSlugRef.current = currentPageSlug;

  /* ── Content updaters ── */

  const applyPageUpdate = useCallback(
    (updater: (page: ContentData) => ContentData) => {
      if (!content) return;
      const newContent: ContentFile = isMultiPage(content)
        ? {
            ...content,
            pages: {
              ...content.pages,
              [currentPageSlug]: updater(content.pages[currentPageSlug] ?? {}),
            },
          }
        : updater(content);
      setHistory((h) => {
        const next = h.slice(0, historyIndex + 1);
        next.push(cloneContent(newContent));
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });
      setHistoryIndex((i) => Math.min(i + 1, MAX_HISTORY - 1));
      setContent(newContent);
      setIframeSyncTick((t) => t + 1);
      setHasUnsaved(true);
    },
    [content, currentPageSlug, historyIndex],
  );

  const applyEmbedPatch = useCallback((patch: Record<string, unknown>, msgSlug?: string) => {
    const prev = contentRef.current;
    if (!prev || !patch || typeof patch !== "object") return;
    const slug = isMultiPage(prev)
      ? msgSlug && prev.pages[msgSlug] !== undefined
        ? msgSlug
        : currentPageSlugRef.current
      : undefined;
    const newContent = mergePatchIntoContentFile(prev, patch, slug);
    setHistory((h) => {
      const idx = historyIndexRef.current;
      const next = h.slice(0, idx + 1);
      next.push(cloneContent(newContent));
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
    setHistoryIndex((i) => Math.min(i + 1, MAX_HISTORY - 1));
    setContent(newContent);
    setHasUnsaved(true);
  }, []);

  /* ── Session & content loading ── */

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) { setSession(false); router.push("/"); return; }
        setSession({ siteUrl: data.siteUrl, name: data.name });
      })
      .catch(() => { setSession(false); router.push("/"); });
  }, [router]);

  useEffect(() => {
    if (session === null || session === false) return;
    setLoading(true);
    setLoadError("");
    fetch("/api/content")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setLoadError(data.error || "Impossible de charger le contenu"); setContent(null); return; }
        const dataContent = data.content as ContentFile;
        setContent(dataContent);
        setHistory([cloneContent(dataContent)]);
        setHistoryIndex(0);
        setSha(data.sha);
        setCurrentPageSlug(getPageOrder(dataContent)[0] ?? "index");
      })
      .catch(() => { setLoadError("Erreur réseau"); setContent(null); })
      .finally(() => setLoading(false));
  }, [session]);

  /* ── Iframe src ── */

  useEffect(() => {
    if (session === null || session === false || !session.siteUrl) { setIframeSrc(null); return; }
    setIframeSrc(`${trimSiteUrl(session.siteUrl)}/?cmsEmbed=1&parentOrigin=${encodeURIComponent(window.location.origin)}`);
  }, [session]);

  useEffect(() => { setIframeReady(false); }, [liveIframeKey, iframeSrc]);

  /* ── PostMessage listener ── */

  useEffect(() => {
    if (session === null || session === false || !session.siteUrl) return;
    let siteOrigin: string;
    try { siteOrigin = new URL(session.siteUrl).origin; } catch { return; }

    const onMsg = (e: MessageEvent) => {
      if (normalizeOrigin(e.origin) !== normalizeOrigin(siteOrigin)) return;
      if (e.data?.source !== "cms-site") return;

      if (e.data.type === "CMS_READY") { setIframeReady(true); return; }

      if (e.data.type === "CMS_PAGE" && typeof e.data.slug === "string") {
        const slug = e.data.slug;
        const c = contentRef.current;
        if (c && isMultiPage(c) && getPageOrder(c).includes(slug)) setCurrentPageSlug(slug);
        return;
      }

      if (e.data.type === "CMS_PATCH" && e.data.patch && typeof e.data.patch === "object") {
        applyEmbedPatch(e.data.patch as Record<string, unknown>, e.data.pageSlug as string | undefined);
        return;
      }

      if (e.data.type === "CMS_UPLOAD_REQUEST" && typeof e.data.uploadKey === "string") {
        const map: Record<string, string> = {
          hero: "cms-upload-hero",
          about: "cms-upload-about",
          "hero-video": "cms-upload-hero-video",
          "about-video": "cms-upload-about-video",
          "videoLoop-video": "cms-upload-videoloop-video",
          "videoPlay-video": "cms-upload-videoplay-video",
          "videoPlay-poster": "cms-upload-videoplay-poster",
        };
        const id = map[e.data.uploadKey];
        if (id) document.getElementById(id)?.click();
        return;
      }

      if (e.data.type === "CMS_SAVE") { handlePublishRef.current(); return; }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [session, applyEmbedPatch]);

  /* ── Push content to iframe ── */

  useEffect(() => {
    if (!iframeReady || !iframeRef.current?.contentWindow || session === null || session === false || !session.siteUrl) return;
    const payload = contentRef.current;
    if (!payload) return;
    let targetOrigin: string;
    try { targetOrigin = new URL(session.siteUrl).origin; } catch { return; }
    try {
      let forIframe: ContentFile = JSON.parse(JSON.stringify(payload));

      const overrides = previewOverridesRef.current;
      if (overrides.size > 0) {
        let json = JSON.stringify(forIframe);
        overrides.forEach((previewUrl, path) => {
          const from = JSON.stringify(path);
          const to = JSON.stringify(previewUrl);
          while (json.includes(from)) json = json.replace(from, to);
        });
        forIframe = JSON.parse(json);
      }

      forIframe = absolutizeContentMediaForEmbed(forIframe, session.siteUrl);

      iframeRef.current.contentWindow.postMessage(
        {
          source: "cms-app",
          type: "CMS_CONTENT",
          content: forIframe,
          pageSlug: isMultiPage(payload) ? currentPageSlug : undefined,
        },
        targetOrigin,
      );
    } catch { /* ignore */ }
  }, [iframeReady, liveIframeKey, currentPageSlug, iframeSyncTick, session]);

  /* ── Undo / Redo ── */

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      const idx = historyIndexRef.current;
      if (idx <= 0) return h;
      const newIdx = idx - 1;
      const newContent = cloneContent(h[newIdx]);
      setHistoryIndex(newIdx);
      setContent(newContent);
      if (isMultiPage(newContent) && !getPageOrder(newContent).includes(currentPageSlugRef.current)) {
        setCurrentPageSlug(getPageOrder(newContent)[0] ?? "index");
      }
      setIframeSyncTick((t) => t + 1);
      setHasUnsaved(true);
      return h;
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((h) => {
      const idx = historyIndexRef.current;
      if (idx >= h.length - 1) return h;
      const newIdx = idx + 1;
      const newContent = cloneContent(h[newIdx]);
      setHistoryIndex(newIdx);
      setContent(newContent);
      if (isMultiPage(newContent) && !getPageOrder(newContent).includes(currentPageSlugRef.current)) {
        setCurrentPageSlug(getPageOrder(newContent)[0] ?? "index");
      }
      setIframeSyncTick((t) => t + 1);
      setHasUnsaved(true);
      return h;
    });
  }, []);

  /* ── Publish ── */

  const handlePublish = useCallback(async () => {
    const c = contentRef.current;
    if (!c || !sha || publishing) return;
    setPublishMessage("");
    setPublishing(true);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: c, sha }),
      });
      const data = await res.json();
      if (!res.ok) { setPublishMessage(data.error || "Échec de la publication"); return; }
      setPublishMessage("Publié");
      setHasUnsaved(false);
      setLiveIframeKey((k) => k + 1);
      const refreshRes = await fetch("/api/content");
      const refreshData = await refreshRes.json();
      if (refreshData.sha) setSha(refreshData.sha);
      setTimeout(() => setPublishMessage(""), 4000);
    } catch {
      setPublishMessage("Erreur réseau");
    } finally {
      setPublishing(false);
    }
  }, [sha, publishing]);

  const handlePublishRef = useRef(handlePublish);
  handlePublishRef.current = handlePublish;

  /* ── Keyboard shortcuts (parent window) ── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handlePublishRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ── File upload helpers ── */

  function xhrPost(url: string, body: FormData | string, headers?: Record<string, string>, onProgress?: (r: number) => void): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      if (headers) Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: () => Promise.resolve(JSON.parse(xhr.responseText)) });
      xhr.onerror = () => reject(new Error("Erreur réseau"));
      xhr.send(body);
    });
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadDirectToGitHub(file: File, filePath: string): Promise<{ path: string; rawUrl: string }> {
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) throw new Error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(0)} Mo > 100 Mo). Compressez-le d'abord.`);

    const credRes = await fetch("/api/upload-credentials");
    if (!credRes.ok) throw new Error("Impossible d'obtenir les identifiants");
    const { token, owner, repo } = await credRes.json();
    const base64 = await fileToBase64(file);
    const h: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" };
    const api = `https://api.github.com/repos/${owner}/${repo}`;

    const repoRes = await fetch(api, { headers: h });
    if (!repoRes.ok) throw new Error("Accès dépôt impossible");
    const { default_branch: branch } = await repoRes.json();

    const blobRes = await xhrPost(`${api}/git/blobs`, JSON.stringify({ content: base64, encoding: "base64" }), h, (r) => setUploadProgress(r));
    if (!blobRes.ok) throw new Error("Erreur blob");
    const { sha: blobSha } = (await blobRes.json()) as { sha: string };

    const refRes = await fetch(`${api}/git/ref/heads/${branch}`, { headers: h });
    if (!refRes.ok) throw new Error("Branche introuvable");
    const headSha: string = (await refRes.json()).object.sha;

    const commitRes = await fetch(`${api}/git/commits/${headSha}`, { headers: h });
    if (!commitRes.ok) throw new Error("Commit introuvable");
    const baseTree: string = (await commitRes.json()).tree.sha;

    const treeRes = await fetch(`${api}/git/trees`, { method: "POST", headers: h, body: JSON.stringify({ base_tree: baseTree, tree: [{ path: filePath, mode: "100644", type: "blob", sha: blobSha }] }) });
    if (!treeRes.ok) throw new Error("Arbre impossible");
    const newTree: string = (await treeRes.json()).sha;

    const cRes = await fetch(`${api}/git/commits`, { method: "POST", headers: h, body: JSON.stringify({ message: `Média ${filePath} via CMS`, tree: newTree, parents: [headSha] }) });
    if (!cRes.ok) throw new Error("Commit impossible");
    const newCommit: string = (await cRes.json()).sha;

    await fetch(`${api}/git/refs/heads/${branch}`, { method: "PATCH", headers: h, body: JSON.stringify({ sha: newCommit }) });

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${newCommit}/${filePath}`;
    return { path: filePath, rawUrl };
  }

  async function onImageFileChange(e: React.ChangeEvent<HTMLInputElement>, key: "hero" | "about") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !content) return;
    setUploadingMedia(key);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("key", key);
      const res = await xhrPost("/api/upload-image", form, undefined, (r) => setUploadProgress(r));
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPublishMessage(data.error || `Échec upload (${res.status})`);
        return;
      }
      const data = (await res.json()) as { path: string; rawUrl: string; pathWebp?: string; pathAvif?: string };
      previewOverridesRef.current.set(data.path, data.rawUrl);
      if (data.pathWebp) previewOverridesRef.current.set(data.pathWebp, data.rawUrl);
      if (data.pathAvif) previewOverridesRef.current.set(data.pathAvif, data.rawUrl);
      applyPageUpdate((c) => ({
        ...c,
        [key]: {
          ...(c[key] as object),
          image: data.path,
          ...(data.pathWebp && { imageWebp: data.pathWebp }),
          ...(data.pathAvif && { imageAvif: data.pathAvif }),
        } as NonNullable<ContentData[typeof key]>,
      }));
    } catch {
      setPublishMessage("Erreur réseau lors de l'upload");
    } finally {
      setUploadingMedia(null);
    }
  }

  async function onVideoFileChange(e: React.ChangeEvent<HTMLInputElement>, key: string) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !content) return;

    let videoFile = file;
    if ((await import("@/lib/compress-video")).needsCompression(file)) {
      setCompressing(true);
      setCompressionProgress(0);
      setCompressionLog(`${(file.size / 1024 / 1024).toFixed(0)} Mo — compression…`);
      try {
        const { compressVideo } = await import("@/lib/compress-video");
        videoFile = await compressVideo(file, (r) => setCompressionProgress(r), (msg) => setCompressionLog(msg));
      } catch (err) {
        setPublishMessage(`Compression échouée: ${err instanceof Error ? err.message : "inconnue"}`);
        setCompressing(false);
        return;
      }
      setCompressing(false);
    }

    setUploadingMedia(key);
    setUploadProgress(0);

    let uploadedPath: string | null = null;
    let uploadedRawUrl: string | null = null;

    try {
      const form = new FormData();
      form.append("file", videoFile);
      form.append("key", key);
      const res = await xhrPost("/api/upload-video", form, undefined, (r) => setUploadProgress(r));
      if (res.ok) {
        const data = (await res.json()) as { path: string; rawUrl: string };
        uploadedPath = data.path;
        uploadedRawUrl = data.rawUrl;
      }
    } catch { /* server upload failed, try direct */ }

    if (!uploadedPath) {
      try {
        const ext = videoFile.type === "video/webm" ? "webm" : "mp4";
        const filePath = `images/${key}.${ext}`;
        const { path, rawUrl } = await uploadDirectToGitHub(videoFile, filePath);
        uploadedPath = path;
        uploadedRawUrl = rawUrl;
      } catch (err) {
        setPublishMessage(`Upload vidéo échoué: ${err instanceof Error ? err.message : "Vérifiez les permissions du token GitHub."}`);
        setUploadingMedia(null);
        return;
      }
    }

    previewOverridesRef.current.set(uploadedPath, uploadedRawUrl!);
    if (key === "hero-video") applyPageUpdate((c) => ({ ...c, hero: { ...c.hero, video: uploadedPath } as NonNullable<ContentData["hero"]> }));
    else if (key === "about-video") applyPageUpdate((c) => ({ ...c, about: { ...c.about, video: uploadedPath } as NonNullable<ContentData["about"]> }));
    else if (key === "videoLoop-video") applyPageUpdate((c) => ({ ...c, videoLoop: { ...(c.videoLoop ?? { title: "", video: "" }), video: uploadedPath! } }));
    else if (key === "videoPlay-video") applyPageUpdate((c) => ({ ...c, videoPlay: { ...(c.videoPlay ?? { title: "", video: "" }), video: uploadedPath! } }));
    setUploadingMedia(null);
  }

  async function onPosterFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !content) return;
    setUploadingMedia("poster");
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("key", "videoPlay-poster");
      const res = await xhrPost("/api/upload-image", form, undefined, (r) => setUploadProgress(r));
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPublishMessage(data.error || `Échec upload (${res.status})`);
        return;
      }
      const data = (await res.json()) as { path: string; rawUrl: string };
      previewOverridesRef.current.set(data.path, data.rawUrl);
      applyPageUpdate((c) => ({ ...c, videoPlay: { ...(c.videoPlay ?? { title: "", video: "" }), poster: data.path } }));
    } catch (err) {
      setPublishMessage(`Upload poster: ${err instanceof Error ? err.message : "réseau"}`);
    } finally {
      setUploadingMedia(null);
    }
  }

  /* ── Guards ── */

  if (session === null) return <FullScreenLoading message="Vérification de la session…" />;
  if (session !== false && loading) return <FullScreenLoading message="Chargement du projet…" />;

  if (loadError) {
    return (
      <div className="min-h-screen bg-[var(--cms-bg)] flex items-center justify-center p-4">
        <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] p-8 text-center max-w-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--cms-error)]/10 text-[var(--cms-error)]">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="font-display text-xl font-semibold text-[var(--cms-text)]">Impossible de charger le contenu</h2>
          <p className="mt-2 text-sm text-[var(--cms-text-muted)]">{loadError}</p>
          <p className="mt-4 text-xs text-[var(--cms-text-muted)]">Vérifiez que le dépôt contient un fichier <code className="rounded bg-[var(--cms-bg)] px-1.5 py-0.5">content.json</code>.</p>
        </div>
      </div>
    );
  }

  if (!content) return null;

  const pageOrder = getPageOrder(content);
  const showPageTabs = isMultiPage(content) && pageOrder.length > 1;
  const siteUrl = session && typeof session === "object" ? session.siteUrl : undefined;

  /* ── Render ── */

  return (
    <div className="h-dvh flex flex-col bg-[var(--cms-bg)] overflow-hidden">

      {/* ═══ Header ═══ */}
      <header className="flex-none border-b border-[var(--cms-border)] bg-[var(--cms-surface)]">
        <div className="flex items-center justify-between px-3 h-11 gap-2">

          {/* Left: name + page tabs */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-semibold text-[var(--cms-text)] truncate max-w-[140px]">
              {session && typeof session === "object" && session.name ? session.name : "Édition"}
            </h1>

            {showPageTabs && (
              <div className="flex items-center rounded-md bg-[var(--cms-bg)] p-0.5 gap-0.5">
                {pageOrder.map((slug) => (
                  <button
                    key={slug}
                    onClick={() => setCurrentPageSlug(slug)}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                      slug === currentPageSlug
                        ? "bg-[var(--cms-surface)] text-[var(--cms-text)] shadow-sm"
                        : "text-[var(--cms-text-muted)] hover:text-[var(--cms-text)]"
                    }`}
                  >
                    {pageLabel(slug)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: undo/redo + status + publish + actions */}
          <div className="flex items-center gap-1.5">

            {/* Undo / Redo */}
            <div className="flex items-center rounded-md border border-[var(--cms-border)] bg-[var(--cms-bg)] p-0.5">
              <button type="button" onClick={handleUndo} disabled={historyIndex <= 0} className="rounded p-1 text-[var(--cms-text-muted)] hover:text-[var(--cms-text)] disabled:opacity-30 disabled:pointer-events-none" title="Annuler (Ctrl+Z)">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </button>
              <button type="button" onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="rounded p-1 text-[var(--cms-text-muted)] hover:text-[var(--cms-text)] disabled:opacity-30 disabled:pointer-events-none" title="Rétablir (Ctrl+Y)">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
              </button>
            </div>

            {/* Status */}
            {publishMessage && (
              <span className={`text-[11px] font-medium ${publishMessage === "Publié" ? "text-[var(--cms-success)]" : "text-[var(--cms-error)]"}`}>
                {publishMessage === "Publié" ? "✓ Publié" : publishMessage}
              </span>
            )}
            {!publishMessage && hasUnsaved && (
              <span className="text-[11px] text-[var(--cms-text-muted)]">Modifié</span>
            )}

            {/* Publish */}
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {publishing ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Enregistrement…
                </span>
              ) : "Publier"}
            </button>

            {/* View site */}
            {siteUrl && (
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="rounded p-1.5 text-[var(--cms-text-muted)] hover:text-[var(--cms-text)] transition-colors" title="Voir le site">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            )}

            {/* Logout */}
            <button
              type="button"
              onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); router.refresh(); }}
              className="rounded p-1.5 text-[var(--cms-text-muted)] hover:text-[var(--cms-text)] transition-colors text-xs"
              title="Déconnexion"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      {/* ═══ Hidden file inputs ═══ */}
      <input id="cms-upload-hero" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={(e) => onImageFileChange(e, "hero")} />
      <input id="cms-upload-about" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={(e) => onImageFileChange(e, "about")} />
      <input id="cms-upload-hero-video" type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => onVideoFileChange(e, "hero-video")} />
      <input id="cms-upload-about-video" type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => onVideoFileChange(e, "about-video")} />
      <input id="cms-upload-videoloop-video" type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => onVideoFileChange(e, "videoLoop-video")} />
      <input id="cms-upload-videoplay-video" type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => onVideoFileChange(e, "videoPlay-video")} />
      <input id="cms-upload-videoplay-poster" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={onPosterFileChange} />

      {/* ═══ Overlays ═══ */}
      {compressing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] px-10 py-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--cms-border)] border-t-white animate-spin" />
            <p className="text-sm font-medium text-[var(--cms-text)]">Compression vidéo…</p>
            <div className="w-full bg-[var(--cms-bg)] rounded-full h-2 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${Math.round(compressionProgress * 100)}%` }} />
            </div>
            <p className="text-xs text-[var(--cms-text-muted)] text-center">{compressionLog}</p>
          </div>
        </div>
      )}
      {uploadingMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] px-10 py-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--cms-border)] border-t-white animate-spin" />
            <p className="text-sm font-medium text-[var(--cms-text)]">Envoi en cours…</p>
            <div className="w-full bg-[var(--cms-bg)] rounded-full h-2 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
            </div>
            <p className="text-xs text-[var(--cms-text-muted)]">{Math.round(uploadProgress * 100)} %</p>
          </div>
        </div>
      )}

      {/* ═══ Instruction hint (dismissible) ═══ */}
      {showHint && siteUrl && (
        <div className="flex-none flex items-center justify-between gap-4 px-3 py-1 bg-[#111] border-b border-[var(--cms-border)]">
          <p className="text-[10px] text-[var(--cms-text-muted)] leading-relaxed">
            Cliquez sur les <strong className="text-[var(--cms-text)]">textes</strong> pour les modifier
            &nbsp;·&nbsp; Cliquez sur les <strong className="text-[var(--cms-text)]">images</strong> pour les remplacer
            &nbsp;·&nbsp; <strong className="text-[var(--cms-text)]">Shift + clic</strong> sur une vidéo pour la remplacer
            &nbsp;·&nbsp; <strong className="text-[var(--cms-text)]">Ctrl + S</strong> pour publier
          </p>
          <button onClick={() => setShowHint(false)} className="text-[var(--cms-text-muted)] hover:text-[var(--cms-text)] text-sm leading-none shrink-0 px-1" title="Fermer">×</button>
        </div>
      )}

      {/* ═══ Main content: iframe or setup prompt ═══ */}
      {siteUrl && iframeSrc ? (
        <iframe
          key={liveIframeKey}
          ref={iframeRef}
          src={iframeSrc}
          title="Aperçu du site"
          className="flex-1 w-full border-0 min-h-0 bg-black"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        />
      ) : (
        <div className="flex-1 grid place-items-center p-8">
          <div className="text-center max-w-md space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)]">
              <svg className="h-7 w-7 text-[var(--cms-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--cms-text)]">URL du site non configurée</h2>
            <p className="text-sm text-[var(--cms-text-muted)]">
              Ajoutez la clé <code className="rounded bg-[var(--cms-bg)] px-1.5 py-0.5 text-xs">&quot;siteUrl&quot;</code> dans <code className="rounded bg-[var(--cms-bg)] px-1.5 py-0.5 text-xs">projects.json</code> pour activer l&apos;édition inline.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
