"use client";

import { useState, useEffect, useRef } from "react";
import type { ContentData, SectionId } from "@/lib/content-types";
import { mergeTheme } from "@/lib/content-types";
import "./preview.css";

const DEFAULT_SECTION_ORDER: SectionId[] = ["hero", "about", "services", "contact"];

const GRIP_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

function imageSrc(url: string, siteUrl?: string, cacheBust?: number): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const path = url.startsWith("/") ? url.slice(1) : url;
  if (siteUrl && !cacheBust) {
    const base = siteUrl.replace(/\/$/, "");
    return `${base}/${path}`;
  }
  const base = `/api/image?path=${encodeURIComponent(path)}`;
  return cacheBust ? `${base}&t=${cacheBust}` : base;
}

const UPLOAD_HERO_ID = "cms-upload-hero";
const UPLOAD_ABOUT_ID = "cms-upload-about";

interface SitePreviewProps {
  content: ContentData;
  onHero: (field: keyof ContentData["hero"], value: string) => void;
  onAbout: (field: keyof ContentData["about"], value: string) => void;
  onService: (index: number, field: "title" | "description", value: string) => void;
  onServicesTitle: (value: string) => void;
  onContact: (field: keyof ContentData["contact"], value: string) => void;
  onSectionReorder: (fromIndex: number, toIndex: number) => void;
  onServiceCardReorder: (fromIndex: number, toIndex: number) => void;
  imageCacheBust?: number;
  siteUrl?: string;
}

export default function SitePreview({
  content,
  onHero,
  onAbout,
  onService,
  onServicesTitle,
  onContact,
  onSectionReorder,
  onServiceCardReorder,
  imageCacheBust,
  siteUrl,
}: SitePreviewProps) {
  const theme = mergeTheme(content.theme);
  const sectionOrder = content.sectionOrder?.length ? content.sectionOrder : DEFAULT_SECTION_ORDER;
  const [dragOverSection, setDragOverSection] = useState<number | null>(null);
  const [dragOverCard, setDragOverCard] = useState<number | null>(null);
  const [draggingSection, setDraggingSection] = useState<number | null>(null);
  const [draggingCard, setDraggingCard] = useState<number | null>(null);
  const scrollRAF = useRef<number | null>(null);
  const isDragging = draggingSection !== null || draggingCard !== null;

  useEffect(() => {
    if (!isDragging) return;
    const ZONE = 120;
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      const y = e.clientY;
      const h = typeof window !== "undefined" ? window.innerHeight : 800;
      let dy = 0;
      if (y < ZONE) {
        const t = 1 - y / ZONE;
        dy = -Math.round(8 + t * 16);
      } else if (y > h - ZONE) {
        const t = (y - (h - ZONE)) / ZONE;
        dy = Math.round(8 + t * 16);
      }
      if (dy !== 0 && typeof window !== "undefined") {
        if (scrollRAF.current != null) cancelAnimationFrame(scrollRAF.current);
        scrollRAF.current = requestAnimationFrame(() => {
          window.scrollBy({ top: dy!, behavior: "auto" });
          scrollRAF.current = null;
        });
      }
    };
    document.addEventListener("dragover", handleDragOver, false);
    return () => {
      document.removeEventListener("dragover", handleDragOver, false);
      if (scrollRAF.current != null) cancelAnimationFrame(scrollRAF.current);
    };
  }, [isDragging]);

  const handleSectionDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", `section:${index}`);
    e.dataTransfer.effectAllowed = "move";
    setDraggingSection(index);
  };
  const handleSectionDragEnd = () => {
    setDraggingSection(null);
    setDragOverSection(null);
  };
  const handleSectionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSection(index);
  };
  const handleSectionDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    setDragOverSection(null);
    setDraggingSection(null);
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw.startsWith("section:")) return;
    const fromIndex = parseInt(raw.replace("section:", ""), 10);
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
    onSectionReorder(fromIndex, toIndex);
  };
  const handleCardDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", `card:${index}`);
    e.dataTransfer.effectAllowed = "move";
    setDraggingCard(index);
  };
  const handleCardDragEnd = () => {
    setDraggingCard(null);
    setDragOverCard(null);
  };
  const handleCardDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCard(index);
  };
  const handleCardDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    setDragOverCard(null);
    setDraggingCard(null);
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw.startsWith("card:")) return;
    const fromIndex = parseInt(raw.replace("card:", ""), 10);
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
    onServiceCardReorder(fromIndex, toIndex);
  };

  const sections: Record<SectionId, React.ReactNode> = {
    hero: (
      <header key="hero" className="preview-hero">
        <div className="preview-hero__bg">
          <label
            htmlFor={UPLOAD_HERO_ID}
            className="preview-image-wrap"
            style={{ position: "absolute", inset: 0, cursor: "pointer", margin: 0 }}
          >
            <img
              className="preview-hero__image"
              src={imageSrc(content.hero.image, siteUrl, imageCacheBust)}
              alt=""
            />
          </label>
        </div>
        <div className="preview-hero__content">
          <input
            className="preview-input preview-hero__title"
            style={{ color: theme.heroTitle }}
            value={content.hero.title}
            onChange={(e) => onHero("title", e.target.value)}
            placeholder="Titre"
            aria-label="Titre hero"
          />
          <input
            className="preview-input preview-hero__subtitle"
            style={{ color: theme.heroSubtitle }}
            value={content.hero.subtitle}
            onChange={(e) => onHero("subtitle", e.target.value)}
            placeholder="Sous-titre"
            aria-label="Sous-titre hero"
          />
        </div>
      </header>
    ),
    about: (
      <section key="about" className="preview-about">
        <div className="preview-about__grid">
          <div className="preview-about__media">
            <label
              htmlFor={UPLOAD_ABOUT_ID}
              className="preview-image-wrap"
              style={{ cursor: "pointer", margin: 0, display: "block" }}
            >
              <img
                className="preview-about__image"
                src={imageSrc(content.about.image, siteUrl, imageCacheBust)}
                alt=""
              />
            </label>
          </div>
          <div className="preview-about__text">
            <input
              className="preview-input preview-about__title"
              style={{ color: theme.aboutTitle }}
              value={content.about.title}
              onChange={(e) => onAbout("title", e.target.value)}
              placeholder="Titre"
              aria-label="Titre à propos"
            />
            <textarea
              className="preview-input preview-about__body"
              style={{ color: theme.aboutText }}
              value={content.about.text}
              onChange={(e) => onAbout("text", e.target.value)}
              placeholder="Texte"
              rows={5}
              aria-label="Texte à propos"
            />
          </div>
        </div>
      </section>
    ),
    services: (
      <section key="services" className="preview-services" style={{ background: theme.servicesBg }}>
        <input
          className="preview-input preview-services__title"
          style={{ color: theme.servicesTitle }}
          value={content.services.title}
          onChange={(e) => onServicesTitle(e.target.value)}
          placeholder="Titre services"
          aria-label="Titre services"
        />
        <div className="preview-services__list">
          {content.services.items.map((item, i) => (
            <div
              key={i}
              className={`preview-card-wrap${dragOverCard === i ? " preview-drag-over" : ""}${draggingCard === i ? " preview-dragging" : ""}`}
              onDragOver={(e) => handleCardDragOver(e, i)}
              onDragLeave={() => setDragOverCard(null)}
              onDrop={(e) => handleCardDrop(e, i)}
            >
              <span
                className="preview-drag-handle"
                draggable
                onDragStart={(e) => handleCardDragStart(e, i)}
                onDragEnd={handleCardDragEnd}
                title="Déplacer la carte"
                aria-label="Déplacer la carte"
              >
                {GRIP_ICON}
              </span>
              <div className="preview-service-card" style={{ background: theme.serviceCardBg }}>
                <input
                  className="preview-input preview-service-card__title"
                  style={{ color: theme.serviceCardTitle }}
                  value={item.title}
                  onChange={(e) => onService(i, "title", e.target.value)}
                  placeholder="Titre"
                  aria-label={`Service ${i + 1} titre`}
                />
                <textarea
                  className="preview-input preview-service-card__description"
                  style={{ color: theme.serviceCardText }}
                  value={item.description}
                  onChange={(e) => onService(i, "description", e.target.value)}
                  placeholder="Description"
                  rows={2}
                  aria-label={`Service ${i + 1} description`}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    ),
    contact: (
      <section key="contact" className="preview-contact">
        <input
          className="preview-input preview-contact__title"
          style={{ color: theme.contactTitle }}
          value={content.contact.title}
          onChange={(e) => onContact("title", e.target.value)}
          placeholder="Titre contact"
          aria-label="Titre contact"
        />
        <input
          className="preview-input preview-contact__text"
          style={{ color: theme.contactText }}
          value={content.contact.text}
          onChange={(e) => onContact("text", e.target.value)}
          placeholder="Texte"
          aria-label="Texte contact"
        />
        <span
          className="preview-contact__cta"
          style={{ background: theme.contactButtonBg, color: theme.contactButtonText }}
        >
          <input
            className="preview-input preview-contact__cta-input"
            value={content.contact.buttonLabel}
            onChange={(e) => onContact("buttonLabel", e.target.value)}
            placeholder="Bouton"
            aria-label="Libellé bouton"
            style={{ color: theme.contactButtonText }}
          />
        </span>
        <input
          type="email"
          className="preview-input preview-contact__email"
          style={{ color: theme.contactText }}
          value={content.contact.email}
          onChange={(e) => onContact("email", e.target.value)}
          placeholder="Email"
          aria-label="Email contact"
        />
      </section>
    ),
  };

  return (
    <div className="preview-root">
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700&family=Outfit:wght@600;700&display=swap"
        rel="stylesheet"
      />
      <main>
        {sectionOrder.map((id, index) => (
          <div
            key={id}
            className={`preview-section-wrap${dragOverSection === index ? " preview-drag-over" : ""}${draggingSection === index ? " preview-dragging" : ""}`}
            onDragOver={(e) => handleSectionDragOver(e, index)}
            onDragLeave={() => setDragOverSection(null)}
            onDrop={(e) => handleSectionDrop(e, index)}
          >
            <span
              className="preview-drag-handle"
              draggable
              onDragStart={(e) => handleSectionDragStart(e, index)}
              onDragEnd={handleSectionDragEnd}
              title="Déplacer la section"
              aria-label="Déplacer la section"
            >
              {GRIP_ICON}
            </span>
            {sections[id]}
          </div>
        ))}
      </main>
    </div>
  );
}
