import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Hotel data ingestion (MVP)",
  description: "Scrape, gap-detect, human review, normalize, export JSON/CSV",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
