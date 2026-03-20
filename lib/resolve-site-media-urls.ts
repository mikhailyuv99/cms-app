import type { ContentData, ContentFile } from "./content-types";
import { isMultiPage } from "./content-types";

/** Base du site déployé, sans slash final. */
export function trimSiteUrl(u: string) {
  return u.replace(/\/$/, "");
}

/**
 * Transforme une URL ou un chemin de média en URL absolue pour le domaine du site client.
 * - Déjà absolue (http, https, data, blob) → inchangée
 * - Protocol-relative //… → https://…
 * - Commence par / → origin + chemin
 * - Sinon → origin + / + chemin (toujours à la racine du site, jamais relatif au path du document)
 *
 * Important en iframe (?cmsEmbed=1) : sans ça, les chemins sans slash initial peuvent se résoudre
 * incorrectement selon le path du document et les médias ne chargent pas.
 */
export function resolveSiteMediaUrl(siteUrl: string, raw: string | undefined): string | undefined {
  if (raw == null || typeof raw !== "string") return raw;
  const u = raw.trim();
  if (!u) return u;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith("//")) {
    try {
      return new URL(`https:${u}`).href;
    } catch {
      return u;
    }
  }
  try {
    const origin = new URL(trimSiteUrl(siteUrl)).origin;
    const path = u.startsWith("/") ? u : `/${u.replace(/^\.\//, "")}`;
    return `${origin}${path}`;
  } catch {
    return raw;
  }
}

function absolutizePageData(page: ContentData, siteUrl: string): ContentData {
  const out = { ...page } as ContentData;
  if (out.hero) {
    const h = { ...out.hero };
    if (h.image) h.image = resolveSiteMediaUrl(siteUrl, h.image) ?? h.image;
    if (h.imageWebp) h.imageWebp = resolveSiteMediaUrl(siteUrl, h.imageWebp) ?? h.imageWebp;
    if (h.imageAvif) h.imageAvif = resolveSiteMediaUrl(siteUrl, h.imageAvif) ?? h.imageAvif;
    if (h.video) h.video = resolveSiteMediaUrl(siteUrl, h.video) ?? h.video;
    out.hero = h;
  }
  if (out.about) {
    const a = { ...out.about };
    if (a.image) a.image = resolveSiteMediaUrl(siteUrl, a.image) ?? a.image;
    if (a.imageWebp) a.imageWebp = resolveSiteMediaUrl(siteUrl, a.imageWebp) ?? a.imageWebp;
    if (a.imageAvif) a.imageAvif = resolveSiteMediaUrl(siteUrl, a.imageAvif) ?? a.imageAvif;
    if (a.video) a.video = resolveSiteMediaUrl(siteUrl, a.video) ?? a.video;
    out.about = a;
  }
  if (out.videoLoop) {
    const v = { ...out.videoLoop };
    if (v.video) v.video = resolveSiteMediaUrl(siteUrl, v.video) ?? v.video;
    out.videoLoop = v;
  }
  if (out.videoPlay) {
    const v = { ...out.videoPlay };
    if (v.video) v.video = resolveSiteMediaUrl(siteUrl, v.video) ?? v.video;
    if (v.poster) v.poster = resolveSiteMediaUrl(siteUrl, v.poster) ?? v.poster;
    out.videoPlay = v;
  }
  return out;
}

/** Copie profonde via JSON + résolution des champs médias pour l’iframe (ne mute pas l’état React). */
export function absolutizeContentMediaForEmbed(content: ContentFile, siteUrl: string): ContentFile {
  if (!siteUrl?.trim()) return content;
  const clone = JSON.parse(JSON.stringify(content)) as ContentFile;
  if (isMultiPage(clone)) {
    for (const key of Object.keys(clone.pages)) {
      clone.pages[key] = absolutizePageData(clone.pages[key] ?? {}, siteUrl);
    }
    return clone;
  }
  return absolutizePageData(clone as ContentData, siteUrl);
}
