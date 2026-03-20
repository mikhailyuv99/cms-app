"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getEffectiveSectionOrder,
  getPageOrder,
  getCurrentPageContent,
  isMultiPage,
  type ContentData,
  type ContentFile,
  type SectionId,
  type Position,
} from "@/lib/content-types";
import SitePreview from "./SitePreview";

const MAX_HISTORY = 80;

function trimSiteUrl(u: string) {
  return u.replace(/\/$/, "");
}

function cloneContent(c: ContentFile): ContentFile {
  return JSON.parse(JSON.stringify(c));
}

/** Fusion profonde légère des sections (hero, about, …) pour les patches venant de l’iframe */
function mergePatchIntoPage(page: ContentData, patch: Record<string, unknown>): ContentData {
  const next = { ...page };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === undefined) continue;
    if (k === "sectionOrder" && Array.isArray(v)) {
      next.sectionOrder = v as SectionId[];
      continue;
    }
    if (k === "theme" && v && typeof v === "object" && !Array.isArray(v)) {
      next.theme = { ...next.theme, ...(v as ContentData["theme"]) };
      continue;
    }
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
    pages: {
      ...file.pages,
      [slug]: mergePatchIntoPage(prevPage, patch),
    },
  };
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
  const [uploadingImage, setUploadingImage] = useState<"hero" | "about" | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState<"hero" | "about" | null>(null);
  const [imageCacheBust, setImageCacheBust] = useState(0);
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionLog, setCompressionLog] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  /** Recharge l’iframe après publish (déploiement) */
  const [liveIframeKey, setLiveIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  /** Incrémenté pour forcer l’envoi du JSON complet à l’iframe (pas à chaque frappe inline). */
  const [iframeSyncTick, setIframeSyncTick] = useState(0);

  const contentRef = useRef(content);
  contentRef.current = content;
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;
  const currentPageSlugRef = useRef(currentPageSlug);
  currentPageSlugRef.current = currentPageSlug;

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
    },
    [content, currentPageSlug, historyIndex]
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
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          setSession(false);
          router.push("/");
          return;
        }
        setSession({ siteUrl: data.siteUrl, name: data.name });
      })
      .catch(() => {
        setSession(false);
        router.push("/");
      });
  }, [router]);

  useEffect(() => {
    if (session === null || session === false) return;
    setLoading(true);
    setLoadError("");
    fetch("/api/content")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setLoadError(data.error || "Impossible de charger le contenu");
          setContent(null);
          return;
        }
        const dataContent = data.content as ContentFile;
        setContent(dataContent);
        setHistory([cloneContent(dataContent)]);
        setHistoryIndex(0);
        setSha(data.sha);
        const order = getPageOrder(dataContent);
        setCurrentPageSlug(order[0] ?? "index");
      })
      .catch(() => {
        setLoadError("Erreur réseau");
        setContent(null);
      })
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    if (session === null || session === false || !session.siteUrl) {
      setIframeSrc(null);
      return;
    }
    setIframeSrc(`${trimSiteUrl(session.siteUrl)}/?cmsEmbed=1&parentOrigin=${encodeURIComponent(window.location.origin)}`);
  }, [session]);

  useEffect(() => {
    setIframeReady(false);
  }, [liveIframeKey, iframeSrc]);

  useEffect(() => {
    if (session === null || session === false || !session.siteUrl) return;
    let siteOrigin: string;
    try {
      siteOrigin = new URL(session.siteUrl).origin;
    } catch {
      return;
    }
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== siteOrigin) return;
      if (e.data?.source !== "cms-site") return;
      if (e.data?.type === "CMS_READY") {
        setIframeReady(true);
        return;
      }
      if (e.data?.type === "CMS_PAGE" && typeof e.data.slug === "string") {
        const slug = e.data.slug as string;
        const c = contentRef.current;
        if (c && isMultiPage(c) && getPageOrder(c).includes(slug)) {
          setCurrentPageSlug(slug);
        }
        return;
      }
      if (e.data?.type === "CMS_PATCH" && e.data.patch && typeof e.data.patch === "object") {
        applyEmbedPatch(e.data.patch as Record<string, unknown>, e.data.pageSlug as string | undefined);
        return;
      }
      if (e.data?.type === "CMS_UPLOAD_REQUEST" && typeof e.data.uploadKey === "string") {
        const inputIdByKey: Record<string, string> = {
          hero: "cms-upload-hero",
          about: "cms-upload-about",
          "hero-video": "cms-upload-hero-video",
          "about-video": "cms-upload-about-video",
          "videoLoop-video": "cms-upload-videoloop-video",
          "videoPlay-video": "cms-upload-videoplay-video",
          "videoPlay-poster": "cms-upload-videoplay-poster",
        };
        const inputId = inputIdByKey[e.data.uploadKey];
        if (inputId) document.getElementById(inputId)?.click();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [session, applyEmbedPatch]);

  useEffect(() => {
    if (!iframeReady || !iframeRef.current?.contentWindow || session === null || session === false || !session.siteUrl) return;
    const payload = contentRef.current;
    if (!payload) return;
    let targetOrigin: string;
    try {
      targetOrigin = new URL(session.siteUrl).origin;
    } catch {
      return;
    }
    try {
      iframeRef.current.contentWindow.postMessage(
        {
          source: "cms-app",
          type: "CMS_CONTENT",
          content: cloneContent(payload),
          pageSlug: isMultiPage(payload) ? currentPageSlug : undefined,
        },
        targetOrigin,
      );
    } catch {
      /* ignore */
    }
  }, [iframeReady, liveIframeKey, currentPageSlug, iframeSyncTick, session]);

  async function handlePublish() {
    if (!content || !sha) return;
    setPublishMessage("");
    setPublishing(true);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, sha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishMessage(data.error || "Échec de la publication");
        return;
      }
      setPublishMessage("Contenu publié. Le site sera mis à jour après le déploiement Netlify.");
      setLiveIframeKey((k) => k + 1);
      const refreshRes = await fetch("/api/content");
      const refreshData = await refreshRes.json();
      if (refreshData.sha) setSha(refreshData.sha);
    } catch {
      setPublishMessage("Erreur réseau");
    } finally {
      setPublishing(false);
    }
  }

  function updateHero(field: keyof NonNullable<ContentData["hero"]>, value: string) {
    applyPageUpdate((c) => ({
      ...c,
      hero: { ...c.hero, [field]: value } as NonNullable<ContentData["hero"]>,
    }));
  }
  function updateAbout(field: keyof NonNullable<ContentData["about"]>, value: string) {
    applyPageUpdate((c) => ({
      ...c,
      about: { ...c.about, [field]: value } as NonNullable<ContentData["about"]>,
    }));
  }
  function updateService(index: number, field: "title" | "description", value: string) {
    applyPageUpdate((c) => {
      const services = c.services ?? { title: "", items: [] };
      const items = [...services.items];
      items[index] = { ...items[index], [field]: value };
      return { ...c, services: { ...services, items } };
    });
  }
  function updateContact(field: keyof NonNullable<ContentData["contact"]>, value: string) {
    applyPageUpdate((c) => ({
      ...c,
      contact: { ...c.contact, [field]: value } as NonNullable<ContentData["contact"]>,
    }));
  }

  function reorderSection(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    applyPageUpdate((c) => {
      const order = [...getEffectiveSectionOrder(c)];
      const [item] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, item);
      return { ...c, sectionOrder: order };
    });
  }

  function reorderServiceCard(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    applyPageUpdate((c) => {
      const services = c.services ?? { title: "", items: [] };
      const items = [...services.items];
      const [item] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, item);
      return { ...c, services: { ...services, items } };
    });
  }

  function handleImagePosition(section: SectionId, pos: Position) {
    applyPageUpdate((c) => {
      const s = c[section];
      if (!s || typeof s !== "object") return c;
      return { ...c, [section]: { ...s, imagePosition: pos } };
    });
  }

  function handleContentPosition(section: SectionId, pos: Position) {
    applyPageUpdate((c) => {
      const s = c[section];
      if (!s || typeof s !== "object") return c;
      return { ...c, [section]: { ...s, contentPosition: pos } };
    });
  }

  function handleUndo() {
    if (historyIndex <= 0 || !content) return;
    const newIndex = historyIndex - 1;
    const newContent = cloneContent(history[newIndex]);
    setHistoryIndex(newIndex);
    setContent(newContent);
    if (isMultiPage(newContent) && !getPageOrder(newContent).includes(currentPageSlug)) {
      setCurrentPageSlug(getPageOrder(newContent)[0] ?? "index");
    }
    setIframeSyncTick((t) => t + 1);
  }
  function handleRedo() {
    if (historyIndex >= history.length - 1 || !content) return;
    const newIndex = historyIndex + 1;
    const newContent = cloneContent(history[newIndex]);
    setHistoryIndex(newIndex);
    setContent(newContent);
    if (isMultiPage(newContent) && !getPageOrder(newContent).includes(currentPageSlug)) {
      setCurrentPageSlug(getPageOrder(newContent)[0] ?? "index");
    }
    setIframeSyncTick((t) => t + 1);
  }

  function xhrPost(url: string, body: FormData | string, headers?: Record<string, string>, onProgress?: (ratio: number) => void): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
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

  async function onImageFileChange(e: React.ChangeEvent<HTMLInputElement>, key: "hero" | "about") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !content) return;
    setUploadingImage(key);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("key", key);
      const res = await xhrPost("/api/upload-image", form, undefined, (r) => setUploadProgress(r));
      if (!res.ok) {
        let msg = `Échec de l'upload (${res.status})`;
        try { const data = await res.json() as { error?: string }; msg = data.error || msg; } catch { /* non-JSON response */ }
        setPublishMessage(msg);
        return;
      }
      const data = await res.json() as { path: string; pathWebp?: string; pathAvif?: string };
      if (key === "hero") {
        applyPageUpdate((c) => ({
          ...c,
          hero: {
            ...c.hero,
            image: data.path,
            ...(data.pathWebp && { imageWebp: data.pathWebp }),
            ...(data.pathAvif && { imageAvif: data.pathAvif }),
          } as NonNullable<ContentData["hero"]>,
        }));
      } else {
        applyPageUpdate((c) => ({
          ...c,
          about: {
            ...c.about,
            image: data.path,
            ...(data.pathWebp && { imageWebp: data.pathWebp }),
            ...(data.pathAvif && { imageAvif: data.pathAvif }),
          } as NonNullable<ContentData["about"]>,
        }));
      }
      setImageCacheBust(Date.now());
    } catch {
      setPublishMessage("Erreur lors de l'upload");
    } finally {
      setUploadingImage(null);
    }
  }

  const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB — hard GitHub limit

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(",")[1]);
      };
      reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadDirectToGitHub(file: File, filePath: string): Promise<string> {
    if (file.size > MAX_VIDEO_SIZE) {
      throw new Error(
        `Le fichier fait ${(file.size / 1024 / 1024).toFixed(0)} Mo. La limite GitHub est de 100 Mo. Compressez votre vidéo.`
      );
    }

    const credRes = await fetch("/api/upload-credentials");
    if (!credRes.ok) throw new Error("Impossible d'obtenir les identifiants");
    const { token, owner, repo } = await credRes.json();

    const base64 = await fileToBase64(file);
    const h: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
    const api = `https://api.github.com/repos/${owner}/${repo}`;

    // Detect default branch
    const repoRes = await fetch(api, { headers: h });
    if (!repoRes.ok) throw new Error("Impossible d'accéder au dépôt");
    const { default_branch: branch } = await repoRes.json();

    // 1 — Create blob (Git Data API: handles large binary reliably)
    const blobRes = await xhrPost(
      `${api}/git/blobs`,
      JSON.stringify({ content: base64, encoding: "base64" }),
      h,
      (r) => setUploadProgress(r),
    );
    if (!blobRes.ok) {
      const err = await blobRes.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `Erreur blob (${blobRes.status})`);
    }
    const { sha: blobSha } = await blobRes.json() as { sha: string };

    // 2 — Get current branch HEAD
    const refRes = await fetch(`${api}/git/ref/heads/${branch}`, { headers: h });
    if (!refRes.ok) throw new Error("Impossible de récupérer la branche");
    const headSha: string = (await refRes.json()).object.sha;

    // 3 — Get base tree
    const commitRes = await fetch(`${api}/git/commits/${headSha}`, { headers: h });
    if (!commitRes.ok) throw new Error("Impossible de récupérer le commit");
    const baseTree: string = (await commitRes.json()).tree.sha;

    // 4 — Create tree with the new file
    const treeRes = await fetch(`${api}/git/trees`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        base_tree: baseTree,
        tree: [{ path: filePath, mode: "100644", type: "blob", sha: blobSha }],
      }),
    });
    if (!treeRes.ok) throw new Error("Impossible de créer l'arbre");
    const newTree: string = (await treeRes.json()).sha;

    // 5 — Create commit
    const cRes = await fetch(`${api}/git/commits`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        message: `Vidéo ${filePath} mise à jour via CMS`,
        tree: newTree,
        parents: [headSha],
      }),
    });
    if (!cRes.ok) throw new Error("Impossible de créer le commit");
    const newCommit: string = (await cRes.json()).sha;

    // 6 — Update branch ref
    const updRes = await fetch(`${api}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ sha: newCommit }),
    });
    if (!updRes.ok) throw new Error("Impossible de mettre à jour la branche");

    return filePath;
  }

  async function onVideoFileChange(e: React.ChangeEvent<HTMLInputElement>, key: string) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !content) return;

    let videoFile = file;

    if ((await import("@/lib/compress-video")).needsCompression(file)) {
      setCompressing(true);
      setCompressionProgress(0);
      setCompressionLog(`Fichier de ${(file.size / 1024 / 1024).toFixed(0)} Mo — compression nécessaire`);
      try {
        const { compressVideo } = await import("@/lib/compress-video");
        videoFile = await compressVideo(
          file,
          (r) => setCompressionProgress(r),
          (msg) => setCompressionLog(msg),
        );
      } catch (err) {
        setPublishMessage(
          `Erreur compression: ${err instanceof Error ? err.message : "inconnue"}. Compressez manuellement sous 100 Mo.`,
        );
        setCompressing(false);
        return;
      }
      setCompressing(false);
    }

    setUploadingVideo(key as "hero" | "about");
    setUploadProgress(0);
    try {
      const ext = videoFile.type === "video/webm" ? "webm" : "mp4";
      const filePath = `images/${key}.${ext}`;
      const path = await uploadDirectToGitHub(videoFile, filePath);
      if (key === "hero-video") applyPageUpdate((c) => ({ ...c, hero: { ...c.hero, video: path } as NonNullable<ContentData["hero"]> }));
      else if (key === "about-video") applyPageUpdate((c) => ({ ...c, about: { ...c.about, video: path } as NonNullable<ContentData["about"]> }));
      else if (key === "videoLoop-video") applyPageUpdate((c) => ({ ...c, videoLoop: { ...(c.videoLoop ?? { title: "", video: "" }), video: path } }));
      else if (key === "videoPlay-video") applyPageUpdate((c) => ({ ...c, videoPlay: { ...(c.videoPlay ?? { title: "", video: "" }), video: path } }));
      setImageCacheBust(Date.now());
    } catch (err) {
      setPublishMessage(`Erreur upload vidéo: ${err instanceof Error ? err.message : "réseau"}`);
    } finally {
      setUploadingVideo(null);
    }
  }

  async function onPosterFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !content) return;
    setUploadingImage("about");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("key", "videoPlay-poster");
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      if (!res.ok) {
        let msg = `Échec de l'upload (${res.status})`;
        try { const data = await res.json(); msg = data.error || msg; } catch { /* non-JSON response */ }
        setPublishMessage(msg);
        return;
      }
      const data = await res.json();
      applyPageUpdate((c) => ({ ...c, videoPlay: { ...(c.videoPlay ?? { title: "", video: "" }), poster: data.path } }));
      setImageCacheBust(Date.now());
    } catch (err) {
      setPublishMessage(`Erreur upload miniature: ${err instanceof Error ? err.message : "réseau"}`);
    } finally {
      setUploadingImage(null);
    }
  }

  if (session === null) {
    return <FullScreenLoading message="Vérification de la session…" />;
  }

  if (session !== false && loading) {
    return <FullScreenLoading message="Chargement de votre projet…" />;
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[var(--cms-bg)] flex items-center justify-center p-4">
        <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] p-8 text-center max-w-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--cms-error)]/10 text-[var(--cms-error)]">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="font-display text-xl font-semibold text-[var(--cms-text)]">Impossible de charger le contenu</h2>
          <p className="mt-2 text-sm text-[var(--cms-text-muted)]">{loadError}</p>
          <p className="mt-4 text-xs text-[var(--cms-text-muted)]">
            Vérifiez que le dépôt contient un fichier <code className="rounded bg-[var(--cms-bg)] px-1.5 py-0.5">content.json</code> à la racine.
          </p>
        </div>
      </div>
    );
  }

  if (!content) return null;

  const pageOrder = getPageOrder(content);
  const pageContent = getCurrentPageContent(content, currentPageSlug);
  const showPageTabs = isMultiPage(content) && pageOrder.length > 1;
  const siteUrl = session && typeof session === "object" ? session.siteUrl : undefined;

  return (
    <div className="min-h-screen bg-[var(--cms-bg)]">
      <header className="sticky top-0 z-50 border-b border-[var(--cms-border)] bg-[var(--cms-surface)]">
        <div className="mx-auto flex max-w-7xl flex-nowrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2">
          <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
            <h1 className="font-display truncate text-base font-semibold text-[var(--cms-text)] sm:text-lg">
              {session && typeof session === "object" && session.name ? session.name : "Édition du site"}
            </h1>
            <div className="flex shrink-0 items-center rounded-md border border-[var(--cms-border)] bg-[var(--cms-bg)] p-0.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="rounded p-1.5 text-[var(--cms-text-muted)] hover:bg-[var(--cms-surface)] hover:text-[var(--cms-text)] disabled:opacity-40 disabled:pointer-events-none sm:p-2"
                aria-label="Annuler"
                title="Annuler"
              >
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="rounded p-1.5 text-[var(--cms-text-muted)] hover:bg-[var(--cms-surface)] hover:text-[var(--cms-text)] disabled:opacity-40 disabled:pointer-events-none sm:p-2"
                aria-label="Rétablir"
                title="Rétablir"
              >
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {publishMessage && (
              <span className={`hidden text-xs sm:inline-block sm:text-sm ${publishMessage.startsWith("Contenu publié") ? "text-[var(--cms-success)]" : "text-[var(--cms-error)]"}`}>
                {publishMessage.startsWith("Contenu publié") ? "✓ Enregistré" : publishMessage}
              </span>
            )}
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none sm:rounded-lg sm:px-4 sm:py-2"
            >
              {publishing ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="hidden sm:inline">Enregistrement…</span>
                </span>
              ) : (
                "ENREGISTRER"
              )}
            </button>
            {siteUrl && (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md p-1.5 text-white transition-opacity hover:opacity-80 sm:rounded-lg sm:p-2"
                title="Voir le site"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/");
                router.refresh();
              }}
              className="rounded-md px-2 py-1.5 text-xs text-[var(--cms-text-muted)] transition-colors hover:text-[var(--cms-text)] sm:rounded-lg sm:px-3 sm:py-2 sm:text-sm"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <input id="cms-upload-hero" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={(e) => onImageFileChange(e, "hero")} aria-label="Remplacer l'image hero" />
      <input id="cms-upload-about" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={(e) => onImageFileChange(e, "about")} aria-label="Remplacer l'image à propos" />
      <input id="cms-upload-hero-video" type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => onVideoFileChange(e, "hero-video")} aria-label="Remplacer la vidéo hero" />
      <input id="cms-upload-about-video" type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => onVideoFileChange(e, "about-video")} aria-label="Remplacer la vidéo à propos" />
      <input id="cms-upload-videoloop-video" type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => onVideoFileChange(e, "videoLoop-video")} aria-label="Remplacer la vidéo boucle" />
      <input id="cms-upload-videoplay-video" type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => onVideoFileChange(e, "videoPlay-video")} aria-label="Remplacer la vidéo lecture" />
      <input id="cms-upload-videoplay-poster" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={onPosterFileChange} aria-label="Remplacer le poster" />

      {compressing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] px-10 py-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--cms-border)] border-t-white animate-spin" />
            <p className="text-sm font-medium text-[var(--cms-text)]">Compression vidéo…</p>
            <div className="w-full bg-[var(--cms-bg)] rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${Math.round(compressionProgress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--cms-text-muted)] text-center">{compressionLog}</p>
            <p className="text-xs text-[var(--cms-text-muted)]">{Math.round(compressionProgress * 100)}%</p>
          </div>
        </div>
      )}

      {(uploadingImage || uploadingVideo) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] px-10 py-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--cms-border)] border-t-white animate-spin" />
            <p className="text-sm font-medium text-[var(--cms-text)]">Envoi en cours…</p>
            <div className="w-full bg-[var(--cms-bg)] rounded-full h-2 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
            </div>
            <p className="text-xs text-[var(--cms-text-muted)]">{Math.round(uploadProgress * 100)}%</p>
          </div>
        </div>
      )}

      <div className="preview-viewport relative">
        {siteUrl && iframeSrc ? (
          <>
            <div className="flex min-h-[calc(100dvh-3.25rem)] min-w-0 flex-col bg-black">
              <p className="border-b border-[var(--cms-border)] bg-[var(--cms-surface)] px-2 py-1.5 text-center text-[10px] text-[var(--cms-text-muted)] sm:text-xs">
                Cliquez sur les <strong className="text-[var(--cms-text)]">textes</strong> pour les modifier, sur les{" "}
                <strong className="text-[var(--cms-text)]">images / vidéos</strong> pour les remplacer. Bloc lecture :{" "}
                <strong className="text-[var(--cms-text)]">Alt + clic</strong> sur la vidéo pour changer la miniature.
              </p>
              <iframe
                key={liveIframeKey}
                ref={iframeRef}
                src={iframeSrc}
                title="Site — aperçu identique au déploiement"
                className="h-[min(88dvh,960px)] w-full min-h-0 flex-1 border-0 sm:h-[calc(100dvh-6.5rem)]"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </>
        ) : (
          <SitePreview
            content={pageContent}
            onHero={updateHero}
            onAbout={updateAbout}
            onService={updateService}
            onServicesTitle={(v) => applyPageUpdate((c) => ({ ...c, services: { ...(c.services ?? { title: "", items: [] }), title: v } }))}
            onContact={updateContact}
            onVideoLoopTitle={(v) => applyPageUpdate((c) => ({ ...c, videoLoop: { ...(c.videoLoop ?? { title: "", video: "" }), title: v } }))}
            onVideoPlayTitle={(v) => applyPageUpdate((c) => ({ ...c, videoPlay: { ...(c.videoPlay ?? { title: "", video: "" }), title: v } }))}
            onSectionReorder={reorderSection}
            onServiceCardReorder={reorderServiceCard}
            onImagePosition={handleImagePosition}
            onContentPosition={handleContentPosition}
            imageCacheBust={imageCacheBust}
            siteUrl={siteUrl}
            pageOrder={showPageTabs ? pageOrder : undefined}
            currentPageSlug={showPageTabs ? currentPageSlug : undefined}
            onPageChange={showPageTabs ? setCurrentPageSlug : undefined}
          />
        )}
      </div>

    </div>
  );
}
