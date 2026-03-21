export interface ThemeColors {
  heroTitle?: string;
  heroSubtitle?: string;
  aboutTitle?: string;
  aboutText?: string;
  servicesBg?: string;
  servicesTitle?: string;
  serviceCardBg?: string;
  serviceCardTitle?: string;
  serviceCardText?: string;
  contactTitle?: string;
  contactText?: string;
  contactButtonBg?: string;
  contactButtonText?: string;
}

export const DEFAULT_THEME: Required<ThemeColors> = {
  heroTitle: "#ffffff",
  heroSubtitle: "#e8e8e8",
  aboutTitle: "#e8e8e8",
  aboutText: "#a0a0a0",
  servicesBg: "#141414",
  servicesTitle: "#e8e8e8",
  serviceCardBg: "#1a1a1a",
  serviceCardTitle: "#ffffff",
  serviceCardText: "#888888",
  contactTitle: "#e8e8e8",
  contactText: "#a0a0a0",
  contactButtonBg: "#c9a227",
  contactButtonText: "#0d0d0d",
};

export type SectionId = string;

export interface Position { x: number; y: number; }

export interface ContentData {
  theme?: ThemeColors;
  sectionOrder?: string[];
  sectionSizes?: Record<string, number>;
  [key: string]: unknown;
}

export const ALL_SECTION_IDS: string[] = ["hero", "about", "services", "contact", "videoLoop", "videoPlay"];

export interface ContentDataMultiPage {
  pages: Record<string, ContentData>;
  pageOrder?: string[];
}

export type ContentFile = ContentData | ContentDataMultiPage;

export function isMultiPage(content: ContentFile): content is ContentDataMultiPage {
  return (
    typeof content === "object" &&
    content !== null &&
    "pages" in content &&
    typeof (content as ContentDataMultiPage).pages === "object" &&
    (content as ContentDataMultiPage).pages !== null &&
    Object.keys((content as ContentDataMultiPage).pages).length > 0
  );
}

export function getPageOrder(content: ContentFile): string[] {
  if (!isMultiPage(content)) return ["index"];
  const order = content.pageOrder?.length ? content.pageOrder : Object.keys(content.pages);
  return order.filter((slug) => slug in content.pages);
}

export function getCurrentPageContent(content: ContentFile, pageSlug: string): ContentData {
  if (!isMultiPage(content)) return content;
  return content.pages[pageSlug] ?? {};
}

const META_KEYS = new Set(["theme", "sectionOrder", "sectionSizes", "pageOrder", "pages"]);

export function getEffectiveSectionOrder(content: ContentData): string[] {
  if (content.sectionOrder?.length) {
    return content.sectionOrder.filter((id) => content[id] != null);
  }
  return Object.keys(content).filter((k) => !META_KEYS.has(k) && content[k] != null && typeof content[k] === "object" && !Array.isArray(content[k]));
}

export function mergeTheme(theme?: ThemeColors): Required<ThemeColors> {
  if (!theme) return DEFAULT_THEME;
  return { ...DEFAULT_THEME, ...theme };
}
