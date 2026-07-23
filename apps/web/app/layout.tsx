import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getTenantBranding, themeStyle } from "../lib/tenant";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getTenantBranding();
  return {
    title: {
      default: `${branding.name} — Tickets`,
      template: `%s | ${branding.name}`,
    },
    description: `Buy your ${branding.name} ticket, get a QR code, walk in.`,
    ...(branding.logo_url ? { icons: { icon: branding.logo_url } } : {}),
    openGraph: {
      siteName: branding.name,
      ...(branding.logo_url ? { images: [branding.logo_url] } : {}),
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const branding = await getTenantBranding();
  return { themeColor: branding.theme.bg };
}

/** "Wild Media Agency" → gradient accent on the last word, like Pro*Tickt*. */
function LogoText({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  const last = words.pop();
  return (
    <>
      {words.length > 0 ? `${words.join(" ")} ` : ""}
      <span>{last}</span>
    </>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const branding = await getTenantBranding();
  const socials = Object.entries(branding.socials).filter(([, url]) => url);

  return (
    <html lang="en" style={themeStyle(branding.theme)}>
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <header className="site-header">
          <a href="/" className="logo">
            {branding.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo lives on Supabase storage, dimensions unknown
              <img
                className="logo-img"
                src={branding.logo_url}
                alt={branding.name}
              />
            ) : (
              <LogoText name={branding.name} />
            )}
          </a>
        </header>
        <main className="container">{children}</main>
        {(branding.support_email || branding.support_phone || socials.length > 0) && (
          <footer className="site-footer">
            <p className="meta">
              {branding.support_email && (
                <a href={`mailto:${branding.support_email}`}>
                  {branding.support_email}
                </a>
              )}
              {branding.support_phone && (
                <a href={`tel:${branding.support_phone}`}>
                  {branding.support_phone}
                </a>
              )}
              {socials.map(([network, url]) => (
                <a key={network} href={url} target="_blank" rel="noreferrer">
                  {network}
                </a>
              ))}
            </p>
            <p className="meta powered-by">Ticketing by ProTickt</p>
          </footer>
        )}
        <Analytics />
      </body>
    </html>
  );
}
