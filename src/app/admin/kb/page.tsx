import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth";
import { getAllArticlesForAdmin } from "@/lib/kb";
import { getCatalogTools } from "@/lib/registry";
import { contextMeter } from "@/lib/assistant-prompt";
import { listTranslatables, statusesOf } from "@/lib/translatable";
import { STATUS_LABEL, type FieldStatus } from "@/lib/translation-status";
import { KbRow } from "./KbRow";

export const dynamic = "force-dynamic";

const RANK: Record<FieldStatus, number> = { missing: 3, stale: 2, review: 1, ok: 0, na: -1 };

function Meter({ label, m }: { label: string; m: ReturnType<typeof contextMeter> }) {
  const color = m.percent >= 90 ? "var(--critical)" : m.percent >= 70 ? "var(--warning)" : "var(--good)";
  return (
    <div>
      <p className="flex justify-between text-xs" style={{ color: "var(--muted)" }}>
        <span>{label}</span>
        <span>
          ~{m.tokens.toLocaleString()} of {m.maxTokens.toLocaleString()} tokens ({m.percent}%)
        </span>
      </p>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full"
        style={{ background: "var(--line)" }}
        role="meter"
        aria-label={label}
        aria-valuenow={m.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full" style={{ width: `${m.percent}%`, background: color }} />
      </div>
      {m.truncated && (
        <p className="mt-1 text-xs" style={{ color: "var(--critical)" }}>
          Over the limit — the end of the knowledge base is cut off and the assistant cannot see it.
        </p>
      )}
    </div>
  );
}

export default async function KbListPage() {
  const user = await requirePermission("kb.draft");
  const full = userCan(user, "kb.edit");
  const [articles, tools, translatables] = await Promise.all([getAllArticlesForAdmin(), getCatalogTools(), listTranslatables()]);
  const published = articles.filter((a) => a.status === "published");
  const live = contextMeter(tools, published);
  const withDrafts = contextMeter(tools, articles);

  const translation = new Map<string, string | null>();
  for (const t of translatables.filter((x) => x.kind === "kb")) {
    const st = statusesOf(t);
    const notes = (["az", "ru"] as const)
      .map((loc) => [loc, Object.values(st[loc]).reduce<FieldStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "na")] as const)
      .filter(([, s]) => RANK[s] > 0)
      .map(([loc, s]) => `${loc.toUpperCase()} ${STATUS_LABEL[s].toLowerCase()}`);
    translation.set(t.id, notes.length ? notes.join(" · ") : null);
  }

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Knowledge base</h1>
        <Link
          href="/admin/kb/new"
          className="flex items-center rounded-md px-4 text-sm font-medium"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
        >
          + Add article
        </Link>
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        What the assistant answers from, alongside the tool catalog. Only published articles are used. Markdown is
        fine.{" "}
        <Link href="/admin/kb/console" className="underline underline-offset-4">
          Test the assistant with your drafts
        </Link>
        .
      </p>

      <section className="mt-6 space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <h2 className="text-sm font-medium">Assistant context</h2>
        <Meter label="Published (what staff get today)" m={live} />
        <Meter label="If every draft were published" m={withDrafts} />
      </section>

      <ul className="mt-8 list-none space-y-2 p-0">
        {articles.map((a) => (
          <KbRow
            key={a.id}
            a={{
              id: a.id,
              title: a.title,
              status: a.status,
              meta: `${a.status === "published" ? "Published" : "Draft"} · #${a.sortOrder}${a.tags.length ? ` · ${a.tags.join(", ")}` : ""}`,
              translation: translation.get(String(a.id)) ?? null,
              canEdit: full || a.status === "draft",
              canTranslate: userCan(user, "translations.edit") || a.status === "draft",
            }}
          />
        ))}
      </ul>

      {articles.length === 0 && (
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          No articles yet. Without any, the assistant can still answer questions about the tools in the catalog.
        </p>
      )}
    </main>
  );
}
