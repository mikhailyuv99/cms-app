"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getEffectiveSectionOrder,
  getPageOrder,
  getCurrentPageContent,
  isMultiPage,
  type ContentData,
  type ContentFile,
  type SectionId,
} from "@/lib/content-types";
import SitePreview from "./SitePreview";

const DEFAULT_SECTION_ORDER: SectionId[] = ["hero", "about", "services", "contact"];
const MAX_HISTORY = 80;

function cloneContent(c: ContentFile): ContentFile {
  return JSON.parse(JSON.stringify(c));
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
    },
    [content, currentPageSlug, historyIndex]
  );

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

  function handleUndo() {
    if (historyIndex <= 0 || !content) return;
    const newIndex = historyIndex - 1;
    const newContent = cloneContent(history[newIndex]);
    setHistoryIndex(newIndex);
    setContent(newContent);
    if (isMultiPage(newContent) && !getPageOrder(newContent).includes(currentPageSlug)) {
      setCurrentPageSlug(getPageOrder(newContent)[0] ?? "index");
    }
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
  }

  async function onImageFileChange(e: React.ChangeEvent<HTMLInputElement>, key: "hero" | "about") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !content) return;
    setUploadingImage(key);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("key", key);
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      if (!res.ok) {
        let msg = `Échec de l'upload (${res.status})`;
        try { const data = await res.json(); msg = data.error || msg; } catch { /* non-JSON response */ }
        setPublishMessage(msg);
        return;
      }
      const data = await res.json();
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
    const blobRes = await fetch(`${api}/git/blobs`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ content: base64, encoding: "base64" }),
    });
    if (!blobRes.ok) {
      const err = await blobRes.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `Erreur blob (${blobRes.status})`);
    }
    const { sha: blobSha } = await blobRes.json();

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
    setUploadingVideo(key as "hero" | "about");
    try {
      const ext = file.type === "video/webm" ? "webm" : "mp4";
      const filePath = `images/${key}.${ext}`;
      const path = await uploadDirectToGitHub(file, filePath);
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
            {session && typeof session === "object" && session.siteUrl && (
              <a
                href={session.siteUrl}
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

      {(uploadingImage || uploadingVideo) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] px-8 py-6 shadow-2xl">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--cms-border)] border-t-white animate-spin" />
            <p className="text-sm font-medium text-[var(--cms-text)]">Envoi en cours…</p>
          </div>
        </div>
      )}

      <div className="preview-viewport">
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
          imageCacheBust={imageCacheBust}
          siteUrl={session && typeof session === "object" ? session.siteUrl : undefined}
          pageOrder={showPageTabs ? pageOrder : undefined}
          currentPageSlug={showPageTabs ? currentPageSlug : undefined}
          onPageChange={showPageTabs ? setCurrentPageSlug : undefined}
        />
      </div>

    </div>
  );
}
