import { notFound } from "next/navigation";
import { requirePermission, userCan } from "@/lib/auth";
import { getArticleForAdmin, getArticleVersions } from "@/lib/kb";
import { KbForm } from "./KbForm";
import { KbDelete, KbHistory } from "./KbHistory";

export const dynamic = "force-dynamic";

export default async function KbEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ title?: string }> }) {
  const user = await requirePermission("kb.draft");
  const full = userCan(user, "kb.edit");
  const { id } = await params;
  const isNew = id === "new";
  const numericId = Number(id);
  if (!isNew && !Number.isInteger(numericId)) notFound();
  const article = isNew ? null : await getArticleForAdmin(numericId);
  if (!isNew && !article) notFound();
  if (!full && article && article.status !== "draft") notFound();

  return (
    <main className="mx-auto max-w-[720px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        {isNew ? "Add article" : `Edit “${article?.title}”`}
      </h1>
      <KbForm article={article} canPublish={full} defaultTitle={isNew ? String((await searchParams).title ?? "").slice(0, 200) : undefined} />
      {article && (
        <KbHistory articleId={article.id} versions={await getArticleVersions(article.id)} canRestore={full || article.status === "draft"} />
      )}
      {article && full && <KbDelete id={article.id} />}
    </main>
  );
}
