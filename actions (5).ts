"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAuthClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Supabase Auth applies its own rate limiting to this endpoint, which is a
  // large part of why this uses it rather than a hand-rolled password check.
  if (error) redirect("/admin/login?error=1");

  revalidatePath("/admin");
  redirect("/admin");
}

export async function logout() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
