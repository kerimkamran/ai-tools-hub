import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Full read/write, bypasses RLS.
 *
 * The `server-only` import above is the security control that matters: if any
 * client component ever imports this module, even transitively, the BUILD
 * FAILS. That converts "the service-role key shipped to the browser" from a
 * silent catastrophe on a public, indexed site into a loud error at compile
 * time. Do not remove it, and do not re-export the client from a shared
 * barrel file that client code might reach.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
