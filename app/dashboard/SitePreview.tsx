"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ContentData, SectionId } from "@/lib/content-types";
import { mergeTheme, getEffectiveSectionOrder } from "@/lib/content-types";
import "./preview.css";

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

function getIndexFromElement(el: Element | null, kind: "section" | "card"): number | null {
  if (!el) return null;
  const wrap = el.closest(kind === "section" ? ".preview-section-wrap" : ".preview-card-wrap");
  if (!wrap) return null;
  const attr = kind === "section" ? "data-section-index" : "data-card-index";
  const v = wrap.getAttribute(attr);
  return v !== null ? parseInt(v, 10) : null;
}

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
const UPLOAD_HERO_VIDEO_ID = "cms-upload-hero-video";
const UPLOAD_ABOUT_VIDEO_ID = "cms-upload-about-video";

function HeroVideo({
  src,
  poster,
  className,
}: {
  src: string;
  poster: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    const play = () => {
      el.play().catch(() => {});
    };
    el.addEventListener("loadeddata", play);
    if (el.readyState >= 2) play();
    return () => el.removeEventListener("loadeddata", play);
  }, [src]);
  return (
    <video
      ref={ref}
      className={className}
      poster={poster}
      src={src}
      muted
      loop
      playsInline
      autoPlay
    />
  );
}

interface SitePreviewProps {
  content: ContentData;
  onHero: (field: keyof NonNullable<ContentData["hero"]>, value: string) => void;
  onAbout: (field: keyof NonNullable<ContentData["about"]>, value: string) => void;
  onService: (index: number, field: "title" | "description", value: string) => void;
  onServicesTitle: (value: string) => void;
  onContact: (field: keyof NonNullable<ContentData["contact"]>, value: string) => void;
  onVideoLoopTitle: (value: string) => void;
  onVideoPlayTitle: (value: string) => void;
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
  onVideoLoopTitle,
  onVideoPlayTitle,
  onSectionReorder,
  onServiceCardReorder,
  imageCacheBust,
  siteUrl,
}: SitePreviewProps) {
  const theme = mergeTheme(content.theme);
  const sectionOrder = getEffectiveSectionOrder(content);
  const [dragOverSection, setDragOverSection] = useState<number | null>(null);
  const [dragOverCard, setDragOverCard] = useState<number | null>(null);
  const [draggingSection, setDraggingSection] = useState<number | null>(null);
  const [draggingCard, setDraggingCard] = useState<number | null>(null);
  const scrollRAF = useRef<number | null>(null);
  const isDragging = draggingSection !== null || draggingCard !== null;
  const pointerKindRef = useRef<"section" | "card" | null>(null);
  const pointerFromRef = useRef<number>(0);

  const doScroll = useCallback((clientY: number) => {
    const ZONE = 120;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    let dy = 0;
    if (clientY < ZONE) {
      const t = 1 - clientY / ZONE;
      dy = -Math.round(8 + t * 16);
    } else if (clientY > h - ZONE) {
      const t = (clientY - (h - ZONE)) / ZONE;
      dy = Math.round(8 + t * 16);
    }
    if (dy !== 0 && typeof window !== "undefined") {
      if (scrollRAF.current != null) cancelAnimationFrame(scrollRAF.current);
      scrollRAF.current = requestAnimationFrame(() => {
        window.scrollBy({ top: dy!, behavior: "auto" });
        scrollRAF.current = null;
      });
    }
  }, []);

  const startPointerDrag = useCallback(
    (kind: "section" | "card", index: number) => {
      pointerKindRef.current = kind;
      pointerFromRef.current = index;
      if (kind === "section") setDraggingSection(index);
      else setDraggingCard(index);

      const onMove = (e: PointerEvent) => {
        e.preventDefault();
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (kind === "section") {
          const i = getIndexFromElement(el, "section");
          setDragOverSection(i);
        } else {
          const i = getIndexFromElement(el, "card");
          setDragOverCard(i);
        }
        doScroll(e.clientY);
      };
      const onUp = (e: PointerEvent) => {
        e.preventDefault();
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const toIndex = kind === "section" ? getIndexFromElement(el, "section") : getIndexFromElement(el, "card");
        const fromIndex = pointerFromRef.current;
        if (toIndex !== null && fromIndex !== toIndex) {
          if (kind === "section") onSectionReorder(fromIndex, toIndex);
          else onServiceCardReorder(fromIndex, toIndex);
        }
        pointerKindRef.current = null;
        setDraggingSection(null);
        setDraggingCard(null);
        setDragOverSection(null);
        setDragOverCard(null);
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("pointercancel", onUp, true);
        if (scrollRAF.current != null) cancelAnimationFrame(scrollRAF.current);
      };
      document.addEventListener("pointermove", onMove, { capture: true });
      document.addEventListener("pointerup", onUp, { capture: true });
      document.addEventListener("pointercancel", onUp, { capture: true });
    },
    [onSectionReorder, onServiceCardReorder, doScroll]
  );

  const handleSectionPointerDown = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startPointerDrag("section", index);
  };
  const handleCardPointerDown = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startPointerDrag("card", index);
  };

  const sections: Record<SectionId, React.ReactNode | null> = {
    hero: content.hero ? (
      <header key="hero" className="preview-hero">
        <div className="preview-hero__bg">
          {content.hero.video ? (
            <HeroVideo
              className="preview-hero__image"
              poster={imageSrc(content.hero.image, siteUrl, imageCacheBust)}
              src={imageSrc(content.hero.video, siteUrl, imageCacheBust)}
            />
          ) : content.hero.imageAvif || content.hero.imageWebp ? (
            <picture>
              {content.hero.imageAvif && (
                <source type="image/avif" src={imageSrc(content.hero.imageAvif, siteUrl, imageCacheBust)} />
              )}
              {content.hero.imageWebp && (
                <source type="image/webp" src={imageSrc(content.hero.imageWebp, siteUrl, imageCacheBust)} />
              )}
              <img
                className="preview-hero__image"
                src={imageSrc(content.hero.image, siteUrl, imageCacheBust)}
                alt=""
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            </picture>
          ) : (
            <img
              className="preview-hero__image"
              src={imageSrc(content.hero.image, siteUrl, imageCacheBust)}
              alt=""
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          )}
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
        <div className="preview-media-bar">
          <label htmlFor={UPLOAD_HERO_ID} className="preview-media-btn">Modifier image</label>
          {content.hero.video && (
            <label htmlFor={UPLOAD_HERO_VIDEO_ID} className="preview-media-btn">Modifier vidéo</label>
          )}
        </div>
      </header>
    ) : null,
    about: content.about ? (
      <section key="about" className="preview-about">
        <div className="preview-about__grid">
          <div className="preview-about__media preview-media-container">
              {content.about.video ? (
                <video
                  className="preview-about__image"
                  poster={imageSrc(content.about.image, siteUrl, imageCacheBust)}
                  src={imageSrc(content.about.video, siteUrl, imageCacheBust)}
                  muted
                  loop
                  playsInline
                  controls
                />
              ) : content.about.imageAvif || content.about.imageWebp ? (
                <picture>
                  {content.about.imageAvif && (
                    <source type="image/avif" src={imageSrc(content.about.imageAvif, siteUrl, imageCacheBust)} />
                  )}
                  {content.about.imageWebp && (
                    <source type="image/webp" src={imageSrc(content.about.imageWebp, siteUrl, imageCacheBust)} />
                  )}
                  <img
                    className="preview-about__image"
                    src={imageSrc(content.about.image, siteUrl, imageCacheBust)}
                    alt=""
                    loading="eager"
                    decoding="async"
                  />
                </picture>
              ) : (
                <img
                  className="preview-about__image"
                  src={imageSrc(content.about.image, siteUrl, imageCacheBust)}
                  alt=""
                  loading="eager"
                  decoding="async"
                />
              )}
              <div className="preview-media-overlay">
                <label htmlFor={UPLOAD_ABOUT_ID} className="preview-media-btn">Modifier image</label>
                {content.about.video && (
                  <label htmlFor={UPLOAD_ABOUT_VIDEO_ID} className="preview-media-btn">Modifier vidéo</label>
                )}
              </div>
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
    ) : null,
    services: content.services ? (
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
              data-card-index={i}
            >
              <span
                className="preview-drag-handle"
                role="button"
                tabIndex={0}
                onPointerDown={(e) => handleCardPointerDown(e, i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") e.preventDefault();
                }}
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
    ) : null,
    videoLoop: content.videoLoop ? (
      <section key="videoLoop" className="preview-video-loop">
        <div className="preview-video-loop__overlay" />
        <div className="preview-video-loop__media">
          {content.videoLoop.video && (
            <HeroVideo
              className="preview-video-loop__video"
              src={imageSrc(content.videoLoop.video, siteUrl, imageCacheBust)}
              poster=""
            />
          )}
        </div>
        <input
          className="preview-input preview-video-loop__title"
          value={content.videoLoop.title}
          onChange={(e) => onVideoLoopTitle(e.target.value)}
          placeholder="Titre"
          aria-label="Titre vidéo boucle"
        />
        <div className="preview-media-bar">
          <label htmlFor="cms-upload-videoloop-video" className="preview-media-btn">Modifier vidéo</label>
        </div>
      </section>
    ) : null,
    videoPlay: content.videoPlay ? (
      <section key="videoPlay" className="preview-video-play">
        <input
          className="preview-input preview-video-play__title"
          value={content.videoPlay.title}
          onChange={(e) => onVideoPlayTitle(e.target.value)}
          placeholder="Titre"
          aria-label="Titre vidéo lecture"
        />
        <div className="preview-video-play__media preview-media-container">
          {content.videoPlay.video ? (
            <video
              className="preview-video-play__video"
              src={imageSrc(content.videoPlay.video, siteUrl, imageCacheBust)}
              poster={content.videoPlay.poster ? imageSrc(content.videoPlay.poster, siteUrl, imageCacheBust) : undefined}
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
              Aucune vidéo
            </div>
          )}
          <div className="preview-media-overlay">
            <label htmlFor="cms-upload-videoplay-video" className="preview-media-btn">Modifier vidéo</label>
            <label htmlFor="cms-upload-videoplay-poster" className="preview-media-btn">Modifier miniature</label>
          </div>
        </div>
      </section>
    ) : null,
    contact: content.contact ? (
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
    ) : null,
  };

  return (
    <div className="preview-root">
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700&family=Outfit:wght@600;700&display=swap"
        rel="stylesheet"
      />
      <main>
        {sectionOrder.map((id, index) =>
          sections[id] ? (
            <div
              key={id}
              className={`preview-section-wrap${dragOverSection === index ? " preview-drag-over" : ""}${draggingSection === index ? " preview-dragging" : ""}`}
              data-section-index={index}
            >
              <span
                className="preview-drag-handle"
                role="button"
                tabIndex={0}
                onPointerDown={(e) => handleSectionPointerDown(e, index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") e.preventDefault();
                }}
                title="Déplacer la section"
                aria-label="Déplacer la section"
              >
                {GRIP_ICON}
              </span>
              {sections[id]}
            </div>
          ) : null
        )}
      </main>
    </div>
  );
}
