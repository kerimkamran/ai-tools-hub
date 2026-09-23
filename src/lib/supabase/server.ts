import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseConfig(): boolean {
  return Boolean(URL_ && ANON);
}

/**
 * Anon, cookie-free client for public pages.
 *
 * Public routes are statically rendered and must NOT touch cookies -- reading
 * them would opt the route into dynamic rendering and destroy the cacheability
 * that makes this page fast. So the catalog uses this plain client, never the
 * cookie-aware one below.
 */
export function createPublicClient() {
  if (!URL_ || !ANON) throw new Error("Supabase env vars are not configured.");
  return createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cookie-aware client, for /admin only. Used to read the signed-in admin.
 */
export async function createAuthClient() {
  if (!URL_ || !ANON) throw new Error("Supabase env vars are not configured.");
  const cookieStore = await cookies();
  return createServerClient(URL_, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component; middleware refreshes the session.
        }
      },
    },
  });
}
