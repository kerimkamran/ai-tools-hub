import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { strings } from "@/lib/strings";
import { siteUrl } from "@/lib/site";

/**
 * One neutral workhorse face, matching Vantage's type system. Hierarchy comes
 * from size, weight and spacing -- not from switching typefaces.
 * next/font self-hosts the files at build time, so no runtime request to
 * Google and no extra font-src entry in the CSP.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${strings.brand} — ${strings.tagline}`,
    template: `%s · ${strings.brand}`,
  },
  description:
    "A single home for a small collection of AI tools: search, browse and open them from one page.",
  openGraph: {
    type: "website",
    siteName: strings.brand,
    title: `${strings.brand} — ${strings.tagline}`,
    description:
      "A single home for a small collection of AI tools: search, browse and open them from one page.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

/**
 * Applies the stored theme before first paint so there is no flash.
 * Wrapped in try/catch because localStorage throws in private mode and with
 * site data blocked -- the page must render correctly either way.
 */
const NO_FLASH = `try{var t=localStorage.getItem("hub-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
