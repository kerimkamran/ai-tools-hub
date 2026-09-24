import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/db/client";
import { getAiSettings } from "@/lib/ai-settings";

export const dynamic = "force-dynamic";

/**
 * Conversation insights (capability 8). Counts and thumbs ratings always;
 * question/answer text only when a super admin switched storage on -- and
 * then only the last 30 days, without any link to who asked.
 */

const LOCALES = ["en", "az", "ru"] as const;
const LOCALE_NAME = { en: "English", az: "Azərbaycanca", ru: "Русский" } as const;

// Phrases the assistant uses when the knowledge base has no answer. A
// heuristic, deliberately simple: it surfaces candidates, a person decides.
const UNANSWERED = [
  /not (in|part of) (the|this|our) (catalog|knowledge base)/i,
  /(don't|do not|doesn't) have (that|this|any|enough) information/i,
  /i (don't|do not) know/i,
  /no information/i,
  /məlumat(ım)? yoxdur/i,
  /bilik bazasında (yoxdur|tapılmadı)/i,
  /bilmirəm/i,
  /нет (информации|данных|сведений)/i,
  /не знаю/i,
  /в базе знаний (нет|отсутствует)/i,
];

const STOP = new Set(
  (
    "what which where when how does have with this that from your about there their tool tools need want they will would could should " +
    "üçün necə nədir hansı harada niyə olan olur edə edir mənə bizə bizim sizin ilə daha kimi bəs haqqında " +
    "какой какая какие где когда как есть этот этого чтобы можно нужно мне нам наш ваш для или про через также"
  ).split(" ")
);

function topics(questions: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const q of questions) {
    const seen = new Set<string>();
    for (const w of q.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (w.length < 4 || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

type Transcript = { id: string; created_at: Date; locale: string; question: string; answer: string; rating: number | null };

function QuestionList({ rows, empty }: { rows: Transcript[]; empty: string }) {
  return rows.length === 0 ? (
      <p className="mt-2 text-sm" style={{ color: "var(--faint)" }}>{empty}</p>
    ) : (
      <ul className="mt-2 list-none space-y-2 p-0">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--line)" }}>
            <p className="font-medium" lang={r.locale}>{clip(r.question, 300)}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--muted)" }} lang={r.locale}>{clip(r.answer, 400)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--faint)" }}>
              <span>{r.locale.toUpperCase()} · {new Date(r.created_at).toLocaleDateString("en-GB")}</span>
              <Link href={`/admin/kb/new?title=${encodeURIComponent(clip(r.question, 200))}`} className="underline underline-offset-4" style={{ color: "var(--primary)" }}>
                Create article from this question
              </Link>
            </p>
          </li>
        ))}
      </ul>
    );
}

export default async function InsightsPage() {
  await requirePermission("insights.view");
  // Retention is enforced on every view as well as on every new answer.
  await query("delete from assistant_transcripts where created_at < now() - interval '30 days'");

  const [settings, totals, byLocale, transcripts] = await Promise.all([
    getAiSettings(),
    query<{ n: string; up: string; down: string; errors: string }>(
      `select count(*)::text as n,
              count(*) filter (where rating = 1)::text as up,
              count(*) filter (where rating = -1)::text as down,
              count(*) filter (where status = 'error')::text as errors
         from assistant_requests where purpose = 'assistant' and created_at > now() - interval '30 days'`
    ),
    query<{ locale: string | null; n: string }>(
      `select locale, count(*)::text as n from assistant_requests
        where purpose = 'assistant' and created_at > now() - interval '30 days' group by locale`
    ),
    query<Transcript>(
      `select id::text, created_at, locale, question, answer, rating from assistant_transcripts
        where created_at > now() - interval '30 days' order by created_at desc limit 500`
    ),
  ]);
  const t = totals[0];
  const rated = Number(t.up) + Number(t.down);
  const helpful = rated ? Math.round((Number(t.up) / rated) * 100) : null;
  const perLocale = Object.fromEntries(byLocale.map((r) => [r.locale ?? "—", Number(r.n)]));

  const down = transcripts.filter((x) => x.rating === -1).slice(0, 20);
  const unanswered = transcripts.filter((x) => UNANSWERED.some((re) => re.test(x.answer))).slice(0, 20);

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Insights</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Staff assistant, last 30 days.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Card label="Questions" value={t.n} />
        <Card label="Helpful" value={helpful === null ? "—" : `${helpful}%`} />
        <Card label="👍 / 👎" value={`${t.up} / ${t.down}`} />
        <Card label="Failed answers" value={t.errors} />
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
        By language: {LOCALES.map((l) => `${LOCALE_NAME[l]} ${perLocale[l] ?? 0}`).join(" · ")}
      </p>

      {!settings.storeTranscripts ? (
        <section className="mt-8 rounded-lg border p-4 text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          Question and answer text is not stored, so only counts and ratings are shown. A super admin can switch text
          storage on (30 days, no names) under <Link href="/admin/assistant" className="underline underline-offset-4">Assistant & spend</Link>.
        </section>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-base font-semibold">Top topics</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {LOCALES.map((l) => {
                const top = topics(transcripts.filter((x) => x.locale === l).map((x) => x.question));
                return (
                  <div key={l} className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
                    <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>{LOCALE_NAME[l]}</p>
                    {top.length === 0 ? (
                      <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>Not enough questions yet.</p>
                    ) : (
                      <ul className="mt-1 list-none p-0 text-sm" lang={l}>
                        {top.map(([w, n]) => <li key={w}>{w} <span style={{ color: "var(--faint)" }}>×{n}</span></li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <section className="mt-8">
            <h2 className="text-base font-semibold">Possibly unanswered</h2>
            <p className="text-xs" style={{ color: "var(--faint)" }}>Answers where the assistant said the knowledge base had nothing — good candidates for a new article.</p>
            <QuestionList rows={unanswered} empty="None found." />
          </section>
          <section className="mt-8">
            <h2 className="text-base font-semibold">Rated not helpful</h2>
            <QuestionList rows={down} empty="No thumbs-down answers." />
          </section>
          <p className="mt-8 text-xs" style={{ color: "var(--faint)" }}>
            {transcripts.length} stored conversations. Text older than 30 days is deleted automatically.
          </p>
        </>
      )}
    </main>
  );
}
