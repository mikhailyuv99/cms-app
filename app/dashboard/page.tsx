"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ContentData } from "@/lib/content-types";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ siteUrl?: string; name?: string } | null | false>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [content, setContent] = useState<ContentData | null>(null);
  const [sha, setSha] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");

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

  if (session === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-400">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">
            {session && typeof session === "object" && session.name ? session.name : "CMS — Édition du site"}
          </h1>
          <p className="text-sm text-zinc-400">Modifiez les textes et images puis publiez.</p>
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

      {loading ? (
        <p className="text-zinc-400">Chargement du contenu…</p>
      ) : loadError ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <p className="text-red-400">{loadError}</p>
          <p className="text-sm text-zinc-500 mt-2">Vérifiez que le dépôt contient un fichier content.json à la racine.</p>
        </div>
      ) : content ? (
        <div className="space-y-6">
          <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <h2 className="text-base font-medium text-zinc-200 mb-4">Hero</h2>
            <div className="space-y-3">
              <input
                value={content.hero.title}
                onChange={(e) => updateHero("title", e.target.value)}
                placeholder="Titre"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                value={content.hero.subtitle}
                onChange={(e) => updateHero("subtitle", e.target.value)}
                placeholder="Sous-titre"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                value={content.hero.image}
                onChange={(e) => updateHero("image", e.target.value)}
                placeholder="URL de l'image"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </section>

          <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <h2 className="text-base font-medium text-zinc-200 mb-4">À propos</h2>
            <div className="space-y-3">
              <input
                value={content.about.title}
                onChange={(e) => updateAbout("title", e.target.value)}
                placeholder="Titre"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <textarea
                value={content.about.text}
                onChange={(e) => updateAbout("text", e.target.value)}
                placeholder="Texte"
                rows={4}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                value={content.about.image}
                onChange={(e) => updateAbout("image", e.target.value)}
                placeholder="URL de l'image"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </section>

          <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <h2 className="text-base font-medium text-zinc-200 mb-4">Services</h2>
            <input
              value={content.services.title}
              onChange={(e) => setContent({ ...content, services: { ...content.services, title: e.target.value } })}
              placeholder="Titre de la section"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 mb-4"
            />
            <div className="space-y-4">
              {content.services.items.map((item, i) => (
                <div key={i} className="rounded-lg bg-zinc-800/50 p-4 space-y-2">
                  <input
                    value={item.title}
                    onChange={(e) => updateService(i, "title", e.target.value)}
                    placeholder="Titre du service"
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <textarea
                    value={item.description}
                    onChange={(e) => updateService(i, "description", e.target.value)}
                    placeholder="Description"
                    rows={2}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <h2 className="text-base font-medium text-zinc-200 mb-4">Contact</h2>
            <div className="space-y-3">
              <input
                value={content.contact.title}
                onChange={(e) => updateContact("title", e.target.value)}
                placeholder="Titre"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                value={content.contact.text}
                onChange={(e) => updateContact("text", e.target.value)}
                placeholder="Texte"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="email"
                value={content.contact.email}
                onChange={(e) => updateContact("email", e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                value={content.contact.buttonLabel}
                onChange={(e) => updateContact("buttonLabel", e.target.value)}
                placeholder="Libellé du bouton"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </section>

          <div className="flex flex-col gap-3">
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
      ) : null}
    </div>
  );
}
