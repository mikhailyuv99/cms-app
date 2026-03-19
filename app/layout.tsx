import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMS — Édition de site",
  description: "Modifiez le contenu de votre site et publiez en un clic.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
