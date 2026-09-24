import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth";
import { TranslateAllButton } from "./TranslateAllButton";
import { KIND_LABEL, KINDS, listTranslatables, statusesOf } from "@/lib/translatable";
import { STATUS_LABEL, tally, type FieldStatus } from "@/lib/translation-status";

export const dynamic = "force-dynamic";

const COLOR: Record<FieldStatus, string> = {
  ok: "var(--good)",
  missing: "var(--critical)",
  stale: "var(--warning)",
  review: "var(--warning)",
  na: "var(--faint)",
};
const RANK: Record<FieldStatus, number> = { missing: 3, stale: 2, review: 1, ok: 0, na: -1 };

function worst(list: FieldStatus[]): FieldStatus {
  return list.reduce<FieldStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "na");
}

/**
 * Coverage dashboard (capability 6): every translatable thing, how much of
 * it is translated, what went stale because the English changed, and what
 * an AI drafted that nobody has checked yet.
 */
export default async function TranslationsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requirePermission("translations.view");
  const canTranslateAll = userCan(user, "translations.edit");
  const showAll = (await searchParams).all === "1";
  const items = await listTranslatables();

  const perLocale = { az: [] as FieldStatus[], ru: [] as FieldStatus[] };
  const rows = items.map((item) => {
    const st = statusesOf(item);
    perLocale.az.push(...Object.values(st.az));
    perLocale.ru.push(...Object.values(st.ru));
    return { item, az: worst(Object.values(st.az)), ru: worst(Object.values(st.ru)) };
  });
  const cover = { az: tally(perLocale.az), ru: tally(perLocale.ru) };
  const visible = showAll ? rows : rows.filter((r) => RANK[r.az] > 0 || RANK[r.ru] > 0);

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Translations</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Write in English — everything is translated into Azərbaycanca and Русский automatically after each save.
        This page is for checking and correcting. <strong>Missing</strong> or <strong>needs update</strong> means the
        automatic translation has not run yet (or the AI is off or out of budget); visitors see English meanwhile.
      </p>
      {canTranslateAll && <TranslateAllButton />}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {(["az", "ru"] as const).map((loc) => {
          const c = cover[loc];
          return (
            <section key={loc} className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
              <h2 className="text-sm font-medium">{loc === "az" ? "Azərbaycanca" : "Русский"}</h2>
              <p className="mt-1 text-2xl font-semibold">{c.percent}%</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }} aria-hidden="true">
                <div className="h-full" style={{ width: `${c.percent}%`, background: "var(--good)" }} />
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                {c.ok} of {c.total} up to date · {c.missing} missing · {c.stale} need update · {c.review} need review
              </p>
            </section>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{showAll ? "Everything" : "Needs attention"} ({visible.length})</h2>
        <Link href={showAll ? "/admin/translations" : "/admin/translations?all=1"} className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>
          {showAll ? "Show only what needs attention" : "Show everything"}
        </Link>
      </div>

      {KINDS.map((kind) => {
        const list = visible.filter((r) => r.item.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className="mt-6">
            <h3 className="text-sm font-medium" style={{ color: "var(--muted)" }}>{KIND_LABEL[kind]}</h3>
            <ul className="mt-2 list-none space-y-2 p-0">
              {list.map(({ item, az, ru }) => (
                <li key={`${kind}:${item.id}`}>
                  <Link
                    href={`/admin/translations/${kind}/${encodeURIComponent(item.id)}`}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3"
                    style={{ minHeight: 52, borderColor: "var(--line)", color: "var(--foreground)" }}
                  >
                    <span className="min-w-0 truncate text-sm">
                      {item.title}
                      {item.isDraft && <span className="ml-2 text-xs" style={{ color: "var(--faint)" }}>draft</span>}
                    </span>
                    <span className="flex shrink-0 gap-3 text-xs">
                      {([["AZ", az], ["RU", ru]] as const).map(([l, s]) => (
                        <span key={l} style={{ color: COLOR[s] }}>
                          {l} {s === "na" ? "—" : STATUS_LABEL[s].toLowerCase()}
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {visible.length === 0 && (
        <p className="mt-6 text-sm" style={{ color: "var(--good)" }}>Everything is translated and up to date.</p>
      )}
    </main>
  );
}
