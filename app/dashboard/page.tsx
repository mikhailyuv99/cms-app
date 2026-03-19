"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ContentData } from "@/lib/content-types";
import SitePreview from "./SitePreview";

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
  const [content, setContent] = useState<ContentData | null>(null);
  const [sha, setSha] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [uploadingImage, setUploadingImage] = useState<"hero" | "about" | null>(null);
  const [imageCacheBust, setImageCacheBust] = useState(0);

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
        setContent(data.content as ContentData);
        setSha(data.sha);
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

  function updateHero(field: keyof ContentData["hero"], value: string) {
    if (!content) return;
    setContent({ ...content, hero: { ...content.hero, [field]: value } });
  }
  function updateAbout(field: keyof ContentData["about"], value: string) {
    if (!content) return;
    setContent({ ...content, about: { ...content.about, [field]: value } });
  }
  function updateService(index: number, field: "title" | "description", value: string) {
    if (!content) return;
    const items = [...content.services.items];
    items[index] = { ...items[index], [field]: value };
    setContent({ ...content, services: { ...content.services, items } });
  }
  function updateContact(field: keyof ContentData["contact"], value: string) {
    if (!content) return;
    setContent({ ...content, contact: { ...content.contact, [field]: value } });
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
      const data = await res.json();
      if (!res.ok) {
        setPublishMessage(data.error || "Échec de l'upload");
        return;
      }
      if (key === "hero") setContent({ ...content, hero: { ...content.hero, image: data.path } });
      else setContent({ ...content, about: { ...content.about, image: data.path } });
      setImageCacheBust(Date.now());
    } catch {
      setPublishMessage("Erreur lors de l'upload");
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

  return (
    <div className="min-h-screen bg-[var(--cms-bg)]">
      <header className="sticky top-0 z-50 border-b border-[var(--cms-border)] bg-[var(--cms-surface)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="font-display truncate text-lg font-semibold text-[var(--cms-text)]">
              {session && typeof session === "object" && session.name ? session.name : "Édition du site"}
            </h1>
            <p className="truncate text-xs text-[var(--cms-text-muted)] sm:text-sm">
              Modifiez le contenu en direct, puis publiez.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            {session && typeof session === "object" && session.siteUrl && (
              <a
                href={session.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="hidden sm:inline">Voir le site</span>
              </a>
            )}
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/");
                router.refresh();
              }}
              className="rounded-lg px-3 py-2 text-sm text-[var(--cms-text-muted)] transition-colors hover:text-[var(--cms-text)]"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <input id="cms-upload-hero" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={(e) => onImageFileChange(e, "hero")} aria-label="Remplacer l'image hero" />
      <input id="cms-upload-about" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={(e) => onImageFileChange(e, "about")} aria-label="Remplacer l'image à propos" />

      {uploadingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] px-8 py-6 shadow-2xl">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--cms-border)] border-t-white animate-spin" />
            <p className="text-sm font-medium text-[var(--cms-text)]">Envoi de l’image…</p>
          </div>
        </div>
      )}

      <SitePreview
        content={content}
        onHero={updateHero}
        onAbout={updateAbout}
        onService={updateService}
        onServicesTitle={(v) => setContent({ ...content, services: { ...content.services, title: v } })}
        onContact={updateContact}
        imageCacheBust={imageCacheBust}
        siteUrl={session && typeof session === "object" ? session.siteUrl : undefined}
      />

      <footer className="sticky bottom-0 z-40 border-t border-[var(--cms-border)] bg-[var(--cms-surface)]">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
          {publishMessage && (
            <p
              className={`mb-3 flex items-center justify-center gap-2 text-sm ${
                publishMessage.startsWith("Contenu publié") ? "text-[var(--cms-success)]" : "text-[var(--cms-error)]"
              }`}
            >
              {publishMessage.startsWith("Contenu publié") ? (
                <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : null}
              {publishMessage}
            </p>
          )}
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="w-full rounded-xl bg-white px-4 py-3.5 font-semibold text-black transition-opacity hover:opacity-90 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[var(--cms-bg)] disabled:opacity-50 disabled:pointer-events-none"
          >
            {publishing ? (
              <span className="inline-flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Publication…
              </span>
            ) : (
              "Modifications terminées"
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
