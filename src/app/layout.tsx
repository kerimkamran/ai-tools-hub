import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Inter, Manrope, Noto_Sans } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/site";
import { buildThemeStyle, getSiteSettings } from "@/lib/settings";
import { strings } from "@/lib/strings";

/**
 * Manrope: the closest free match to Azerconnect's corporate typeface, Mark
 * Pro, which is proprietary (SparkLab's own source comment says the same).
 * Hierarchy still comes from size, weight and spacing, not from switching
 * faces. next/font self-hosts the files at build time, so there is no
 * runtime request to Google and no extra font-src entry in the CSP.
 */
const manrope = Manrope({
  // cyrillic for the Russian locale (Phase C); Azerbaijani letters (ə, ğ, ı,
  // ş, ç, ö, ü) are covered by latin + latin-ext.
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

/**
 * The Design Studio's curated alternatives (capability 9). Each was checked
 * to render Azerbaijani (ə Ə ğ ı İ ş ç ö ü) and Cyrillic before being added.
 * Self-hosted like Manrope; only the default is preloaded, and a browser
 * downloads one of these only when the published look selects it.
 */
const inter = Inter({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-inter", display: "swap", preload: false });
const noto = Noto_Sans({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-noto", display: "swap", preload: false });
const plex = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
  preload: false,
});

const DESCRIPTION = strings.siteDescription;

/**
 * Was a static `export const metadata`. Brand name and tagline are now
 * admin-editable (the theme editor, Phase B), so the title/OG tags have to
 * be computed per request rather than baked in at build time -- this is
 * the documented Next.js way to do that. getSiteSettings() is wrapped in
 * React's cache(), so this costs nothing extra: it shares one query with
 * RootLayout's own call below and with every page's <Header>.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const title = `${settings.brandName} — ${settings.tagline}`;
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: `%s · ${settings.brandName}` },
    description: DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: settings.brandName,
      title,
      description: DESCRIPTION,
    },
    robots: { index: true, follow: true },
    // A favicon from the uploaded raster logo (served by /brand-icon).
    ...(settings.logoUrl ? { icons: { icon: "/brand-icon" } } : {}),
  };
}

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Shares its query with generateMetadata() above via React's cache() --
  // see the doc comment there. Reads through the anon, cookie-free client
  // (src/lib/settings.ts), so this stays compatible with static/ISR
  // delivery exactly like the tools registry does; a save in the theme
  // editor calls revalidatePath("/", "layout") to bust it everywhere.
  //
  // lang="en" here is the default; each /az and /ru page corrects it before
  // first paint from src/app/[locale]/layout.tsx (this layout cannot see the
  // locale segment's params).
  const settings = await getSiteSettings();

  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable} ${noto.variable} ${plex.variable}`} suppressHydrationWarning>
      <head>
        {/* Theme editor overrides, one file below the globals.css import so
            they win on specificity ties with its :root/:root.dark rules.
            Values are re-validated in buildThemeStyle(), never trusted
            verbatim -- see its doc comment. The CSP already permits inline
            style (next.config.ts), so this needs no policy change. */}
        <style dangerouslySetInnerHTML={{ __html: buildThemeStyle(settings) }} />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
