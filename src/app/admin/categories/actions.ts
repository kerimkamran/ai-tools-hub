"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/lib/db/client";
import { getAdminOrNull } from "@/lib/auth";

export type CategoriesState = { error?: string; ok?: boolean };

const label = z.string().trim().max(40);

/**
 * Saves AZ/RU labels for every category in one submit. The English name is
 * the key and is never changed here -- renaming a category is done on the
 * tools themselves, which keeps the filter key and the stored labels in step.
 */
export async function saveCategories(
  _prev: CategoriesState,
  formData: FormData
): Promise<CategoriesState> {
  if (!(await getAdminOrNull())) return { error: "Not signed in." };

  const names = formData.getAll("name").map((n) => String(n).trim()).filter(Boolean);
  if (names.length > 200) return { error: "Too many categories in one save." };

  for (const name of names) {
    if (name.length > 40) return { error: `Category name too long: ${name.slice(0, 40)}…` };
    const az = label.safeParse(formData.get(`az:${name}`) ?? "");
    const ru = label.safeParse(formData.get(`ru:${name}`) ?? "");
    if (!az.success || !ru.success) return { error: `Labels for “${name}” must be 40 characters or fewer.` };

    const i18n: Record<string, { label: string }> = {};
    if (az.data) i18n.az = { label: az.data };
    if (ru.data) i18n.ru = { label: ru.data };

    await query(
      `insert into categories (name, i18n, updated_at) values ($1, $2, now())
       on conflict (name) do update set i18n = excluded.i18n, updated_at = now()`,
      [name, JSON.stringify(i18n)]
    );
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
