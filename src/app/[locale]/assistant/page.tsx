import { redirect } from "next/navigation";
import { localePath, toLocale } from "@/lib/i18n";

/**
 * Retired: Graham Bell is embedded directly on the home page now (see
 * src/components/GrahamBellPanel.tsx), not on a dedicated /assistant route.
 * This route is kept only so an old bookmark or link still goes somewhere
 * sensible -- straight back to the home page, which shows the working chat
 * to a signed-in staff member and a sign-in prompt to everyone else.
 */
export default async function AssistantPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  redirect(localePath(locale));
}
