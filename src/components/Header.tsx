import Link from "next/link";
import { strings } from "@/lib/strings";
import { getSiteSettings, type SiteSettings } from "@/lib/settings";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The wordmark. One typeface, two tones, lowercase, tight tracking --
 * SparkLab's own lockup shape. Text and attribution now come from the
 * theme editor (Phase B), so an admin can retitle the hub without a code
 * change; the colours are still plain --navy/--leaf CSS vars, which the
 * root layout's injected <style> block already overrides to match.
 */
function Wordmark({ settings }: { settings: SiteSettings }) {
  return (
    <span className="flex flex-col leading-none">
      <span className="text-[15px] font-extrabold lowercase tracking-tight">
        <span style={{ color: "var(--navy)" }}>{settings.wordmarkPrimary}</span>
        <span style={{ color: "var(--leaf)" }}>{settings.wordmarkSecondary}</span>
      </span>
      {settings.attribution && (
        <span className="mt-0.5 text-[9px] tracking-wide" style={{ color: "var(--faint)" }}>
          {settings.attribution}
        </span>
      )}
    </span>
  );
}

/**
 * The wordmark, a theme toggle, and the signature accent rule -- the
 * blue→green gradient used once per page, here rather than as decoration
 * anywhere else. Nothing else belongs in this component.
 *
 * getSiteSettings() is wrapped in React's cache() (src/lib/settings.ts), so
 * calling it again here costs nothing extra: it shares one query per render
 * with the root layout's own call and with generateMetadata()'s.
 * strings.brand ("One.Simple") only survives as the ultimate fallback baked
 * into DEFAULT_SITE_SETTINGS, in case the database is unreachable.
 */
export async function Header() {
  const settings = await getSiteSettings();
  return (
    <header
      className="sticky top-0 z-10 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--background) 88%, transparent)" }}
    >
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-4">
        <Link href="/" className="hover:opacity-70" aria-label={settings.brandName}>
          <Wordmark settings={settings} />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/about"
            className="rounded px-3 py-2 text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            {strings.about}
          </Link>
          <ThemeToggle />
        </div>
      </div>
      <div aria-hidden="true" style={{ height: 3, background: "var(--gradient-accent)" }} />
    </header>
  );
}
