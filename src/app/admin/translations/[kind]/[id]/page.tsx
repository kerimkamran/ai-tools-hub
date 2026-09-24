import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, userCan } from "@/lib/auth";
import { FIELDS, getTranslatable, isKind, KIND_LABEL, statusesOf } from "@/lib/translatable";
import { sourceHash } from "@/lib/translation-status";
import { TranslationEditor } from "./TranslationEditor";

export const dynamic = "force-dynamic";

export default async function TranslationEditorPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requirePermission("translations.view");
  const { kind, id: rawId } = await params;
  if (!isKind(kind)) notFound();
  const id = decodeURIComponent(rawId);
  const item = await getTranslatable(kind, id);
  if (!item) notFound();

  const canEdit =
    kind === "tool" ? userCan(user, "translations.edit") || (item.isDraft && userCan(user, "catalog.draft"))
    : kind === "kb" ? userCan(user, "translations.edit") || (item.isDraft && userCan(user, "kb.draft"))
    : kind === "category" ? userCan(user, "categories.manage")
    : userCan(user, "tagline.edit");

  // A version stamp so the form remounts with fresh values after a save or
  // an AI draft (its inputs are uncontrolled).
  const version = sourceHash(JSON.stringify([item.values, item.meta]));

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-10">
      <Link href="/admin/translations" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>
        ← Translations
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">
        {KIND_LABEL[kind]}: {item.title}
      </h1>
      {!canEdit && (
        <p className="mt-2 text-sm" style={{ color: "var(--warning)" }}>
          Read-only for you{item.isDraft ? "" : " — only drafts can be translated by editors"}.
        </p>
      )}
      <TranslationEditor
        version={version}
        kind={kind}
        id={item.id}
        fields={FIELDS[kind]}
        english={item.english}
        values={item.values}
        statuses={statusesOf(item)}
        canEdit={canEdit}
      />
    </main>
  );
}
