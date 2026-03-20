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

export type SectionId = "hero" | "about" | "services" | "contact" | "videoLoop" | "videoPlay";

export interface Position { x: number; y: number; }

export interface ContentData {
  hero?: {
    title: string;
    subtitle: string;
    image: string;
    badge?: string;
    imageWebp?: string;
    imageAvif?: string;
    video?: string;
    imagePosition?: Position;
    contentPosition?: Position;
  };
  about?: {
    title: string;
    text: string;
    image: string;
    eyebrow?: string;
    imageWebp?: string;
    imageAvif?: string;
    video?: string;
    imagePosition?: Position;
    contentPosition?: Position;
  };
  services?: {
    title: string;
    eyebrow?: string;
    items: Array<{ title: string; description: string }>;
    contentPosition?: Position;
  };
  contact?: {
    title: string;
    text: string;
    email: string;
    buttonLabel?: string;
    cta?: string;
    contentPosition?: Position;
  };
  videoLoop?: {
    title: string;
    video: string;
    videoPosition?: Position;
    contentPosition?: Position;
  };
  videoPlay?: {
    title: string;
    video: string;
    label?: string;
    poster?: string;
    videoPosition?: Position;
    contentPosition?: Position;
  };
  theme?: ThemeColors;
  sectionOrder?: SectionId[];
  [key: string]: unknown;
}

export const ALL_SECTION_IDS: SectionId[] = ["hero", "about", "services", "contact", "videoLoop", "videoPlay"];

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

export function getEffectiveSectionOrder(content: ContentData): SectionId[] {
  const order = content.sectionOrder?.length ? content.sectionOrder : ALL_SECTION_IDS;
  return order.filter((id) => content[id] != null);
}

export function mergeTheme(theme?: ThemeColors): Required<ThemeColors> {
  if (!theme) return DEFAULT_THEME;
  return { ...DEFAULT_THEME, ...theme };
}
