import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMS — Édition de site",
  description: "Modifiez le contenu de votre site et publiez en un clic.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="scrollbar-hide">
      <body className="min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)]">{children}</body>
    </html>
  );
}
