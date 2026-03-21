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

const MEDIA_FIELD_RE = /image|video|poster|media|src|url|webp|avif|jpg|png|mp4|webm/i;
const META_PAGE_KEYS = new Set(["theme", "sectionOrder", "sectionSizes", "pageOrder", "pages"]);

function absolutizePageData(page: ContentData, siteUrl: string): ContentData {
  const out: Record<string, unknown> = { ...page };
  for (const sectionKey of Object.keys(out)) {
    if (META_PAGE_KEYS.has(sectionKey)) continue;
    const val = out[sectionKey];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      out[sectionKey] = absolutizeSectionData(val as Record<string, unknown>, siteUrl);
    }
  }
  return out as ContentData;
}

function absolutizeSectionData(section: Record<string, unknown>, siteUrl: string): Record<string, unknown> {
  const out = { ...section };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "string" && MEDIA_FIELD_RE.test(key)) {
      out[key] = resolveSiteMediaUrl(siteUrl, out[key] as string) ?? out[key];
    }
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
