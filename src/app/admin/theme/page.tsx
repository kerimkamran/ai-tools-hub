import { requireSuperAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { ThemeForm } from "./ThemeForm";

export const dynamic = "force-dynamic";

export default async function ThemePage() {
  await requireSuperAdmin();
  const settings = await getSiteSettings();

  return (
    <main className="mx-auto max-w-[720px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Theme</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Brand name, wordmark, logo and colours. Changes reach the public site within
        seconds — no deploy. Only the colours below are editable; layout, type and the
        contrast-critical structural colours stay fixed, and a palette that fails the
        contrast gate cannot be saved.
      </p>
      <ThemeForm settings={settings} />
    </main>
  );
}
