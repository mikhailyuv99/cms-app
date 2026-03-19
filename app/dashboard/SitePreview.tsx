"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ContentData, SectionId, Position } from "@/lib/content-types";
import { mergeTheme, getEffectiveSectionOrder } from "@/lib/content-types";
import "./preview.css";

function AutoTextarea({
  className,
  style,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
}: {
  className?: string;
  style?: React.CSSProperties;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(resize, [value, resize]);
  return (
    <textarea
      ref={ref}
      className={className}
      style={style}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={1}
      onInput={resize}
    />
  );
}

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

const SNAP_THRESHOLD = 8;
const GUIDE_LINES = [0, 25, 50, 75, 100];

function snap(val: number, threshold: number, containerPx: number): { value: number; snapped: boolean; guide: number | null } {
  for (const g of GUIDE_LINES) {
    const gPx = (g / 100) * containerPx;
    const vPx = (val / 100) * containerPx;
    if (Math.abs(vPx - gPx) < threshold) return { value: g, snapped: true, guide: g };
  }
  return { value: val, snapped: false, guide: null };
}

function DraggableMedia({
  position,
  onPosition,
  children,
  className,
}: {
  position?: Position;
  onPosition: (p: Position) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startRef = useRef({ px: 0, py: 0, ox: 50, oy: 50 });

  const x = position?.x ?? 50;
  const y = position?.y ?? 50;

  const onDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".preview-media-btn, .preview-media-bar, .preview-media-bar-inline, video[controls]")) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.current = true;
    startRef.current = { px: e.clientX, py: e.clientY, ox: x, oy: y };
  }, [x, y]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - startRef.current.px) / rect.width) * -100;
    const dy = ((e.clientY - startRef.current.py) / rect.height) * -100;
    const nx = Math.max(0, Math.min(100, startRef.current.ox + dx));
    const ny = Math.max(0, Math.min(100, startRef.current.oy + dy));
    onPosition({ x: Math.round(nx), y: Math.round(ny) });
  }, [onPosition]);

  const onUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ cursor: "grab" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {children}
    </div>
  );
}

function DraggableContent({
  position,
  onPosition,
  children,
  sectionRef,
}: {
  position?: Position;
  onPosition: (p: Position) => void;
  children: React.ReactNode;
  sectionRef: React.RefObject<HTMLElement | null>;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [activeGuides, setActiveGuides] = useState<{ gx: number | null; gy: number | null }>({ gx: null, gy: null });
  const startRef = useRef({ px: 0, py: 0, ox: 50, oy: 50 });
  const hasCustomPos = position != null;
  const x = position?.x ?? 50;
  const y = position?.y ?? 50;

  const onDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("textarea, input")) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    startRef.current = { px: e.clientX, py: e.clientY, ox: x, oy: y };
  }, [x, y]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !sectionRef.current) return;
    e.preventDefault();
    const rect = sectionRef.current.getBoundingClientRect();
    const dx = ((e.clientX - startRef.current.px) / rect.width) * 100;
    const dy = ((e.clientY - startRef.current.py) / rect.height) * 100;
    const rawX = Math.max(0, Math.min(100, startRef.current.ox + dx));
    const rawY = Math.max(0, Math.min(100, startRef.current.oy + dy));
    const sx = snap(rawX, SNAP_THRESHOLD, rect.width);
    const sy = snap(rawY, SNAP_THRESHOLD, rect.height);
    setActiveGuides({ gx: sx.guide, gy: sy.guide });
    onPosition({ x: Math.round(sx.value * 10) / 10, y: Math.round(sy.value * 10) / 10 });
  }, [isDragging, onPosition, sectionRef]);

  const onUp = useCallback(() => {
    setIsDragging(false);
    setActiveGuides({ gx: null, gy: null });
  }, []);

  const posStyle: React.CSSProperties = hasCustomPos
    ? { position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)", cursor: "grab", zIndex: 2 }
    : { position: "relative", cursor: "grab", zIndex: 2 };

  return (
    <>
      {isDragging && (
        <div className="preview-guides" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
          {GUIDE_LINES.map((g) => (
            <div key={`gx-${g}`} className={`preview-guide-v${activeGuides.gx === g ? " preview-guide-active" : ""}`} style={{ left: `${g}%` }} />
          ))}
          {GUIDE_LINES.map((g) => (
            <div key={`gy-${g}`} className={`preview-guide-h${activeGuides.gy === g ? " preview-guide-active" : ""}`} style={{ top: `${g}%` }} />
          ))}
        </div>
      )}
      <div
        style={posStyle}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {children}
      </div>
    </>
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
  onImagePosition: (section: SectionId, pos: Position) => void;
  onContentPosition: (section: SectionId, pos: Position) => void;
  imageCacheBust?: number;
  siteUrl?: string;
  pageOrder?: string[];
  currentPageSlug?: string;
  onPageChange?: (slug: string) => void;
}

function pageLabel(slug: string): string {
  if (slug === "index") return "Accueil";
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
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
  onImagePosition,
  onContentPosition,
  imageCacheBust,
  siteUrl,
  pageOrder,
  currentPageSlug,
  onPageChange,
}: SitePreviewProps) {
  const showNav = pageOrder && pageOrder.length > 1 && onPageChange;
  const theme = mergeTheme(content.theme);
  const sectionOrder = getEffectiveSectionOrder(content);
  const heroRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);
  const videoLoopRef = useRef<HTMLElement>(null);
  const videoPlayRef = useRef<HTMLElement>(null);
  const contactRef = useRef<HTMLElement>(null);
  const servicesRef = useRef<HTMLElement>(null);
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
    hero: content.hero ? (() => {
      const imgPos = content.hero.imagePosition ?? { x: 50, y: 50 };
      const objPos = `${imgPos.x}% ${imgPos.y}%`;
      return (
        <header key="hero" className="preview-hero" ref={heroRef as React.Ref<HTMLElement>}>
          <div className="preview-hero__bg" />
          <DraggableMedia className="preview-hero__media" position={content.hero.imagePosition} onPosition={(p) => onImagePosition("hero", p)}>
            {content.hero.video ? (
              <HeroVideo className="preview-hero__image" poster={imageSrc(content.hero.image, siteUrl, imageCacheBust)} src={imageSrc(content.hero.video, siteUrl, imageCacheBust)} />
            ) : content.hero.imageAvif || content.hero.imageWebp ? (
              <picture>
                {content.hero.imageAvif && <source type="image/avif" srcSet={imageSrc(content.hero.imageAvif, siteUrl, imageCacheBust)} />}
                {content.hero.imageWebp && <source type="image/webp" srcSet={imageSrc(content.hero.imageWebp, siteUrl, imageCacheBust)} />}
                <img className="preview-hero__image" style={{ objectPosition: objPos }} src={imageSrc(content.hero.image, siteUrl, imageCacheBust)} alt="" loading="eager" decoding="async" fetchPriority="high" />
              </picture>
            ) : (
              <img className="preview-hero__image" style={{ objectPosition: objPos }} src={imageSrc(content.hero.image, siteUrl, imageCacheBust)} alt="" loading="eager" decoding="async" fetchPriority="high" />
            )}
          </DraggableMedia>
          <DraggableContent position={content.hero.contentPosition} onPosition={(p) => onContentPosition("hero", p)} sectionRef={heroRef}>
            <div className="preview-hero__content">
              <AutoTextarea className="preview-input preview-hero__title" style={{ color: theme.heroTitle }} value={content.hero.title} onChange={(v) => onHero("title", v)} placeholder="Titre" aria-label="Titre hero" />
              <AutoTextarea className="preview-input preview-hero__subtitle" style={{ color: theme.heroSubtitle }} value={content.hero.subtitle} onChange={(v) => onHero("subtitle", v)} placeholder="Sous-titre" aria-label="Sous-titre hero" />
            </div>
          </DraggableContent>
          <div className="preview-media-bar">
            <label htmlFor={UPLOAD_HERO_ID} className="preview-media-btn">Modifier image</label>
            {content.hero.video && <label htmlFor={UPLOAD_HERO_VIDEO_ID} className="preview-media-btn">Modifier vidéo</label>}
          </div>
        </header>
      );
    })() : null,
    about: content.about ? (() => {
      const imgPos = content.about.imagePosition ?? { x: 50, y: 50 };
      const objPos = `${imgPos.x}% ${imgPos.y}%`;
      return (
        <section key="about" className="preview-about" ref={aboutRef as React.Ref<HTMLElement>}>
          <div className="preview-about__grid">
            <div className="preview-about__media">
              {content.about.video ? (
                <video className="preview-about__image" style={{ objectPosition: objPos }} poster={imageSrc(content.about.image, siteUrl, imageCacheBust)} src={imageSrc(content.about.video, siteUrl, imageCacheBust)} muted loop playsInline controls />
              ) : content.about.imageAvif || content.about.imageWebp ? (
                <picture>
                  {content.about.imageAvif && <source type="image/avif" srcSet={imageSrc(content.about.imageAvif, siteUrl, imageCacheBust)} />}
                  {content.about.imageWebp && <source type="image/webp" srcSet={imageSrc(content.about.imageWebp, siteUrl, imageCacheBust)} />}
                  <img className="preview-about__image" style={{ objectPosition: objPos }} src={imageSrc(content.about.image, siteUrl, imageCacheBust)} alt="" loading="eager" decoding="async" />
                </picture>
              ) : (
                <img className="preview-about__image" style={{ objectPosition: objPos }} src={imageSrc(content.about.image, siteUrl, imageCacheBust)} alt="" loading="eager" decoding="async" />
              )}
              <div className="preview-media-bar-inline">
                <label htmlFor={UPLOAD_ABOUT_ID} className="preview-media-btn">Modifier image</label>
                {content.about.video && <label htmlFor={UPLOAD_ABOUT_VIDEO_ID} className="preview-media-btn">Modifier vidéo</label>}
              </div>
            </div>
            <DraggableContent position={content.about.contentPosition} onPosition={(p) => onContentPosition("about", p)} sectionRef={aboutRef}>
              <div className="preview-about__text">
                <AutoTextarea className="preview-input preview-about__title" style={{ color: theme.aboutTitle }} value={content.about.title} onChange={(v) => onAbout("title", v)} placeholder="Titre" aria-label="Titre à propos" />
                <AutoTextarea className="preview-input preview-about__body" style={{ color: theme.aboutText }} value={content.about.text} onChange={(v) => onAbout("text", v)} placeholder="Texte" aria-label="Texte à propos" />
              </div>
            </DraggableContent>
          </div>
        </section>
      );
    })() : null,
    services: content.services ? (
      <section key="services" className="preview-services" style={{ background: theme.servicesBg }}>
        <AutoTextarea
          className="preview-input preview-services__title"
          style={{ color: theme.servicesTitle }}
          value={content.services.title}
          onChange={onServicesTitle}
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
      <section key="videoLoop" className="preview-video-loop" ref={videoLoopRef as React.Ref<HTMLElement>}>
        <div className="preview-video-loop__overlay" />
        <DraggableMedia className="preview-video-loop__media" position={content.videoLoop.imagePosition} onPosition={(p) => onImagePosition("videoLoop", p)}>
          {content.videoLoop.video && (
            <HeroVideo className="preview-video-loop__video" src={imageSrc(content.videoLoop.video, siteUrl, imageCacheBust)} poster="" />
          )}
        </DraggableMedia>
        <DraggableContent position={content.videoLoop.contentPosition} onPosition={(p) => onContentPosition("videoLoop", p)} sectionRef={videoLoopRef}>
          <AutoTextarea className="preview-input preview-video-loop__title" value={content.videoLoop.title} onChange={onVideoLoopTitle} placeholder="Titre" aria-label="Titre vidéo boucle" />
        </DraggableContent>
        <div className="preview-media-bar">
          <label htmlFor="cms-upload-videoloop-video" className="preview-media-btn">Modifier vidéo</label>
        </div>
      </section>
    ) : null,
    videoPlay: content.videoPlay ? (
      <section key="videoPlay" className="preview-video-play" ref={videoPlayRef as React.Ref<HTMLElement>}>
        <DraggableContent position={content.videoPlay.contentPosition} onPosition={(p) => onContentPosition("videoPlay", p)} sectionRef={videoPlayRef}>
          <AutoTextarea className="preview-input preview-video-play__title" value={content.videoPlay.title} onChange={onVideoPlayTitle} placeholder="Titre" aria-label="Titre vidéo lecture" />
        </DraggableContent>
        <div className="preview-video-play__media">
          {content.videoPlay.video ? (
            <video className="preview-video-play__video" src={imageSrc(content.videoPlay.video, siteUrl, imageCacheBust)} poster={content.videoPlay.poster ? imageSrc(content.videoPlay.poster, siteUrl, imageCacheBust) : undefined} controls playsInline preload="metadata" />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Aucune vidéo</div>
          )}
        </div>
        <div className="preview-media-bar-inline">
          <label htmlFor="cms-upload-videoplay-video" className="preview-media-btn">Modifier vidéo</label>
          <label htmlFor="cms-upload-videoplay-poster" className="preview-media-btn">Modifier miniature</label>
        </div>
      </section>
    ) : null,
    contact: content.contact ? (
      <section key="contact" className="preview-contact" ref={contactRef as React.Ref<HTMLElement>}>
        <DraggableContent position={content.contact.contentPosition} onPosition={(p) => onContentPosition("contact", p)} sectionRef={contactRef}>
          <AutoTextarea className="preview-input preview-contact__title" style={{ color: theme.contactTitle }} value={content.contact.title} onChange={(v) => onContact("title", v)} placeholder="Titre contact" aria-label="Titre contact" />
          <AutoTextarea className="preview-input preview-contact__text" style={{ color: theme.contactText }} value={content.contact.text} onChange={(v) => onContact("text", v)} placeholder="Texte" aria-label="Texte contact" />
          <span className="preview-contact__cta" style={{ background: theme.contactButtonBg, color: theme.contactButtonText }}>
            <input className="preview-input preview-contact__cta-input" value={content.contact.buttonLabel} onChange={(e) => onContact("buttonLabel", e.target.value)} placeholder="Bouton" aria-label="Libellé bouton" style={{ color: theme.contactButtonText }} />
          </span>
          <input type="email" className="preview-input preview-contact__email" style={{ color: theme.contactText }} value={content.contact.email} onChange={(e) => onContact("email", e.target.value)} placeholder="Email" aria-label="Email contact" />
        </DraggableContent>
      </section>
    ) : null,
  };

  return (
    <div className="preview-root">
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700&family=Outfit:wght@600;700&display=swap"
        rel="stylesheet"
      />
      {showNav && (
        <nav className="preview-site-nav">
          {pageOrder.map((slug) => (
            <button
              key={slug}
              type="button"
              className={`preview-site-nav__link${currentPageSlug === slug ? " active" : ""}`}
              onClick={() => onPageChange(slug)}
            >
              {pageLabel(slug)}
            </button>
          ))}
        </nav>
      )}
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
