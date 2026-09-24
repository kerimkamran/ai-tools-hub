import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n";

/** Pre-Phase-C address; see src/app/page.tsx. Safe to delete. */
export default async function LegacyTool({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(localePath(DEFAULT_LOCALE, `/tools/${encodeURIComponent(slug)}`));
}
