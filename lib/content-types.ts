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

export type SectionId = "hero" | "about" | "services" | "contact";

export interface ContentData {
  hero: {
    title: string;
    subtitle: string;
    image: string;
  };
  about: {
    title: string;
    text: string;
    image: string;
  };
  services: {
    title: string;
    items: Array<{ title: string; description: string }>;
  };
  contact: {
    title: string;
    text: string;
    email: string;
    buttonLabel: string;
  };
  theme?: ThemeColors;
  /** Ordre d’affichage des sections. Par défaut: hero, about, services, contact */
  sectionOrder?: SectionId[];
}

export function mergeTheme(theme?: ThemeColors): Required<ThemeColors> {
  if (!theme) return DEFAULT_THEME;
  return { ...DEFAULT_THEME, ...theme };
}
