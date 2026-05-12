import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SelfServe Hotel Intake",
  description: "Hotel data intake and review",
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
