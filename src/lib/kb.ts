import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { sanitizeI18n, type I18nMap } from "@/lib/i18n";

/**
 * Knowledge base (Phase D). Plain Markdown in a textarea; no rich-text
 * editor, no CMS. Only ever read by the assistant's system prompt and the
 * admin pages -- nothing here is rendered on the public site.
 */

export const KB_I18N_KEYS = ["title", "body"] as const;
export type KbI18nKey = (typeof KB_I18N_KEYS)[number];

export type KbArticle = {
  id: number;
  title: string;
  body: string;
  i18n: I18nMap<KbI18nKey>;
  tags: string[];
  status: "draft" | "published";
  sortOrder: number;
  updatedAt: string;
};

type Row = {
  id: string;
  title: string;
  body: string;
  i18n: unknown;
  tags: string[] | null;
  status: "draft" | "published";
  sort_order: number;
  updated_at: string;
};

const COLUMNS = "id::text, title, body, i18n, tags, status, sort_order, updated_at";

function toArticle(r: Row): KbArticle {
  return {
    id: Number(r.id),
    title: r.title,
    body: r.body,
    i18n: sanitizeI18n(r.i18n, KB_I18N_KEYS),
    tags: r.tags ?? [],
    status: r.status,
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
}

export async function getPublishedArticles(): Promise<KbArticle[]> {
  const rows = await query<Row>(
    `select ${COLUMNS} from kb_articles where status = 'published' order by sort_order, id`
  );
  return rows.map(toArticle);
}

export async function getAllArticlesForAdmin(): Promise<KbArticle[]> {
  const rows = await query<Row>(`select ${COLUMNS} from kb_articles order by sort_order, id`);
  return rows.map(toArticle);
}

export async function getArticleForAdmin(id: number): Promise<KbArticle | null> {
  const row = await queryOne<Row>(`select ${COLUMNS} from kb_articles where id = $1`, [id]);
  return row ? toArticle(row) : null;
}

export type KbVersion = { id: number; savedAt: string; savedBy: string | null; title: string; body: string; status: string; chars: number };

export async function getArticleVersions(id: number): Promise<KbVersion[]> {
  const rows = await query<{ id: string; saved_at: Date; saved_by: string | null; title: string; body: string; status: string }>(
    "select id::text, saved_at, saved_by, title, body, status from kb_article_versions where article_id = $1 order by saved_at desc, id desc",
    [id]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    savedAt: new Date(r.saved_at).toISOString(),
    savedBy: r.saved_by,
    title: r.title,
    body: r.body,
    status: r.status,
    chars: r.title.length + r.body.length,
  }));
}
