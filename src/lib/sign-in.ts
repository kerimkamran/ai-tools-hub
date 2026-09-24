import "server-only";
import { cookies } from "next/headers";
import {
  MFA_PENDING_COOKIE,
  PENDING_COOKIE_OPTIONS,
  SESSION_COOKIE,
  createPendingMfaToken,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";
import { getSecurityPolicy } from "@/lib/security-policy";
import { markSignedIn } from "@/lib/credentials";
import { mfaRequiredFor, resolveRole } from "@/lib/roles";

/**
 * Issuing sessions from Server Actions. MFA is enforced on the SESSION, not
 * on one form: both sign-in paths call afterPassword(), which for an account
 * with MFA sets only the short-lived pre-MFA cookie. The real session cookie
 * carries mfa: true only after /admin/login/mfa verifies a code -- and /admin
 * requires that claim whenever the policy requires MFA. So a password alone,
 * typed into either form, never yields an MFA session.
 */

export async function issueSession(email: string, sv: number, mfa: boolean): Promise<void> {
  const policy = await getSecurityPolicy();
  const at = Math.floor(Date.now() / 1000);
  const token = await createSessionToken({ email, sv, at, mfa }, policy);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(policy, at));
  jar.delete(MFA_PENDING_COOKIE);
}

/** Returns where to redirect after a correct password. */
export async function afterPassword(
  account: { email: string; sessionVersion: number; totpEnabled: boolean },
  next: string,
  via: "admin" | "assistant"
): Promise<string> {
  const jar = await cookies();
  if (account.totpEnabled) {
    jar.delete(SESSION_COOKIE);
    jar.set(
      MFA_PENDING_COOKIE,
      await createPendingMfaToken({ email: account.email, sv: account.sessionVersion, next }),
      PENDING_COOKIE_OPTIONS
    );
    return "/admin/login/mfa";
  }
  await issueSession(account.email, account.sessionVersion, false);
  await markSignedIn(account.email, via, false);
  // Not enrolled yet but required for this role: go straight to set-up
  // (the /admin gate would send them there anyway).
  if (next === "/admin") {
    const policy = await getSecurityPolicy();
    if (mfaRequiredFor(await resolveRole(account.email), policy.mfaRequiredAdmins)) return "/admin/security/mfa";
  }
  return next;
}
