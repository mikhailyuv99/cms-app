"use client";

import type { ContentData } from "@/lib/content-types";
import "./preview.css";

function imageSrc(url: string, cacheBust?: number): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const base = `/api/image?path=${encodeURIComponent(url)}`;
  return cacheBust ? `${base}&t=${cacheBust}` : base;
}

interface SitePreviewProps {
  content: ContentData;
  onHero: (field: keyof ContentData["hero"], value: string) => void;
  onAbout: (field: keyof ContentData["about"], value: string) => void;
  onService: (index: number, field: "title" | "description", value: string) => void;
  onServicesTitle: (value: string) => void;
  onContact: (field: keyof ContentData["contact"], value: string) => void;
  onImageUpload: (key: "hero" | "about") => void;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  imageCacheBust?: number;
}

export default function SitePreview({
  content,
  onHero,
  onAbout,
  onService,
  onServicesTitle,
  onContact,
  onImageUpload,
  imageInputRef,
  imageCacheBust,
}: SitePreviewProps) {
  return (
    <div className="preview-root">
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700&family=Outfit:wght@600;700&display=swap"
        rel="stylesheet"
      />
      <main>
        <header className="preview-hero">
          <div className="preview-hero__bg">
            <div
              className="preview-image-wrap"
              style={{ position: "absolute", inset: 0 }}
              onClick={() => onImageUpload("hero")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onImageUpload("hero")}
            >
              <img
                className="preview-hero__image"
                src={imageSrc(content.hero.image, imageCacheBust)}
                alt=""
              />
            </div>
          </div>
          <div className="preview-hero__content">
            <input
              className="preview-input preview-hero__title"
              value={content.hero.title}
              onChange={(e) => onHero("title", e.target.value)}
              placeholder="Titre"
              aria-label="Titre hero"
            />
            <input
              className="preview-input preview-hero__subtitle"
              value={content.hero.subtitle}
              onChange={(e) => onHero("subtitle", e.target.value)}
              placeholder="Sous-titre"
              aria-label="Sous-titre hero"
            />
          </div>
        </header>

        <section className="preview-about">
          <div className="preview-about__grid">
            <div className="preview-about__media">
              <div
                className="preview-image-wrap"
                onClick={() => onImageUpload("about")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onImageUpload("about")}
              >
                <img
                  className="preview-about__image"
                  src={imageSrc(content.about.image, imageCacheBust)}
                  alt=""
                />
              </div>
            </div>
            <div className="preview-about__text">
              <input
                className="preview-input preview-about__title"
                value={content.about.title}
                onChange={(e) => onAbout("title", e.target.value)}
                placeholder="Titre"
                aria-label="Titre à propos"
              />
              <textarea
                className="preview-input preview-about__body"
                value={content.about.text}
                onChange={(e) => onAbout("text", e.target.value)}
                placeholder="Texte"
                rows={5}
                aria-label="Texte à propos"
              />
            </div>
          </div>
        </section>

        <section className="preview-services">
          <input
            className="preview-input preview-services__title"
            value={content.services.title}
            onChange={(e) => onServicesTitle(e.target.value)}
            placeholder="Titre services"
            style={{ display: "block", width: "100%", textAlign: "center", marginBottom: "2.5rem" }}
            aria-label="Titre services"
          />
          <div className="preview-services__list">
            {content.services.items.map((item, i) => (
              <div key={i} className="preview-service-card">
                <input
                  className="preview-input preview-service-card__title"
                  value={item.title}
                  onChange={(e) => onService(i, "title", e.target.value)}
                  placeholder="Titre"
                  aria-label={`Service ${i + 1} titre`}
                />
                <textarea
                  className="preview-input preview-service-card__description"
                  value={item.description}
                  onChange={(e) => onService(i, "description", e.target.value)}
                  placeholder="Description"
                  rows={2}
                  aria-label={`Service ${i + 1} description`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="preview-contact">
          <input
            className="preview-input preview-contact__title"
            value={content.contact.title}
            onChange={(e) => onContact("title", e.target.value)}
            placeholder="Titre contact"
            style={{ display: "block", width: "100%", textAlign: "center" }}
            aria-label="Titre contact"
          />
          <input
            className="preview-input preview-contact__text"
            value={content.contact.text}
            onChange={(e) => onContact("text", e.target.value)}
            placeholder="Texte"
            style={{ display: "block", width: "100%", textAlign: "center", marginBottom: "1.5rem" }}
            aria-label="Texte contact"
          />
          <input
            className="preview-input"
            value={content.contact.buttonLabel}
            onChange={(e) => onContact("buttonLabel", e.target.value)}
            placeholder="Bouton"
            style={{
              display: "inline-block",
              padding: "0.85rem 1.75rem",
              background: "#c9a227",
              color: "#0d0d0d",
              fontWeight: 600,
              borderRadius: "8px",
              border: "none",
              cursor: "text",
            }}
            aria-label="Libellé bouton"
          />
          <input
            type="email"
            className="preview-input"
            value={content.contact.email}
            onChange={(e) => onContact("email", e.target.value)}
            placeholder="Email"
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.5rem",
              textAlign: "center",
              background: "transparent",
              border: "none",
              color: "#a0a0a0",
              fontSize: "1rem",
            }}
            aria-label="Email contact"
          />
        </section>
      </main>
    </div>
  );
}
