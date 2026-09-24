import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n";

/**
 * Pre-Phase-C address. The catalog now lives at /en, /az and /ru.
 * next.config.ts redirects "/" before this file is ever reached; this stub
 * only exists so the route still resolves somewhere sensible if that
 * redirect is ever removed. Safe to delete.
 */
export default function LegacyHome() {
  redirect(localePath(DEFAULT_LOCALE));
}
