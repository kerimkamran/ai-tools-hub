import { notFound, redirect } from "next/navigation";
import { requirePermission, userCan } from "@/lib/auth";
import { getToolByIdForAdmin } from "@/lib/registry";
import { ToolForm } from "../ToolForm";

export const dynamic = "force-dynamic";

export default async function EditToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("catalog.draft");
  const canPublish = userCan(user, "catalog.edit");
  const { id } = await params;

  const isNew = id === "new";
  const tool = isNew ? null : await getToolByIdForAdmin(id);
  if (!isNew && !tool) notFound();
  // Editors may open drafts only.
  if (!canPublish && tool && tool.status !== "draft") redirect("/admin");

  return (
    <main className="mx-auto max-w-[640px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        {isNew ? "Add tool" : `Edit ${tool?.name}`}
      </h1>
      <ToolForm tool={tool} canPublish={canPublish} />
    </main>
  );
}
