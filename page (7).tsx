import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getToolByIdForAdmin } from "@/lib/registry";
import { ToolForm } from "../ToolForm";

export const dynamic = "force-dynamic";

export default async function EditToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const isNew = id === "new";
  const tool = isNew ? null : await getToolByIdForAdmin(id);
  if (!isNew && !tool) notFound();

  return (
    <main className="mx-auto max-w-[640px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        {isNew ? "Add tool" : `Edit ${tool?.name}`}
      </h1>
      <ToolForm tool={tool} />
    </main>
  );
}
