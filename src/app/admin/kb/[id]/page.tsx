import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getArticleForAdmin } from "@/lib/kb";
import { deleteArticle } from "../actions";
import { KbForm } from "./KbForm";

export const dynamic = "force-dynamic";

export default async function KbEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const numericId = Number(id);
  if (!isNew && !Number.isInteger(numericId)) notFound();
  const article = isNew ? null : await getArticleForAdmin(numericId);
  if (!isNew && !article) notFound();

  return (
    <main className="mx-auto max-w-[720px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        {isNew ? "Add article" : `Edit “${article?.title}”`}
      </h1>
      <KbForm article={article} />
      {article && (
        <form action={deleteArticle} className="mt-10 border-t pt-6" style={{ borderColor: "var(--line)" }}>
          <input type="hidden" name="id" value={article.id} />
          <button type="submit" className="rounded border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--control-border)", color: "var(--critical)" }}>
            Delete this article
          </button>
        </form>
      )}
    </main>
  );
}
