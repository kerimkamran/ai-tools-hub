import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n";

/** Pre-Phase-C address; see src/app/page.tsx. Safe to delete. */
export default function LegacyAbout() {
  redirect(localePath(DEFAULT_LOCALE, "/about"));
}
