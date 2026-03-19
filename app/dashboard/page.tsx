"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ContentData } from "@/lib/content-types";
import SitePreview from "./SitePreview";

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
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  function handleImageUpload(key: "hero" | "about") {
    if (!imageInputRef.current) return;
    setUploadingImage(key);
    imageInputRef.current.setAttribute("data-key", key);
    imageInputRef.current.click();
  }

  async function onImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const key = e.target.getAttribute("data-key") as "hero" | "about" | null;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!key || !file || !content) return;
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-zinc-900/95 border-b border-zinc-800 backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">
            {session && typeof session === "object" && session.name ? session.name : "CMS — Édition du site"}
          </h1>
          <p className="text-sm text-zinc-400">Modifiez le contenu ci-dessous en direct, puis publiez.</p>
        </div>
        <div className="flex items-center gap-3">
          {session && typeof session === "object" && session.siteUrl && (
            <a
              href={session.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-amber-500 hover:text-amber-400"
            >
              Voir le site →
            </a>
          )}
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/");
              router.refresh();
            }}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Déconnexion
          </button>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={onImageFileChange}
        aria-hidden
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-zinc-400">Chargement du contenu…</p>
        </div>
      ) : loadError ? (
        <div className="p-6 max-w-2xl mx-auto">
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <p className="text-red-400">{loadError}</p>
            <p className="text-sm text-zinc-500 mt-2">Vérifiez que le dépôt contient un fichier content.json à la racine.</p>
          </div>
        </div>
      ) : content ? (
        <>
          {uploadingImage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <p className="text-white font-medium">Upload de l&apos;image…</p>
            </div>
          )}
          <SitePreview
            content={content}
            onHero={updateHero}
            onAbout={updateAbout}
            onService={updateService}
            onServicesTitle={(v) => setContent({ ...content, services: { ...content.services, title: v } })}
            onContact={updateContact}
            onImageUpload={handleImageUpload}
            imageInputRef={imageInputRef}
            imageCacheBust={imageCacheBust}
          />
          <div className="sticky bottom-0 z-40 px-4 py-4 bg-zinc-900/95 border-t border-zinc-800 backdrop-blur">
            <div className="max-w-2xl mx-auto flex flex-col gap-3">
              {publishMessage && (
                <p className={publishMessage.startsWith("Contenu publié") ? "text-sm text-green-400" : "text-sm text-red-400"}>
                  {publishMessage}
                </p>
              )}
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="w-full rounded-lg bg-amber-600 px-4 py-3 font-medium text-zinc-950 hover:bg-amber-500 disabled:opacity-50"
              >
                {publishing ? "Publication…" : "Modifications terminées"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
