import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProTickt",
  description: "Buy your ticket, get a QR code, walk in.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a href="/" className="logo">
            Pro<span>Tickt</span>
          </a>
        </header>
        <main className="container">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
