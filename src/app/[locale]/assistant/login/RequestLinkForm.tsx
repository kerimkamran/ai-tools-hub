"use client";

import { useActionState } from "react";
import { requestAssistantLink, type RequestLinkState } from "../actions";

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)" };

// Only the plain strings this form needs -- never the whole Strings["assistant"]
// dictionary, which also carries functions (e.g. tooLong) that cannot cross
// the server -> client boundary as props.
export type RequestLinkStrings = {
  email: string;
  sending: string;
  requestSubmit: string;
  requestSent: string;
  requestInvalid: string;
};

/**
 * The self-service half of sign-in (request #1): any address at one of the
 * allowed staff domains can ask for a one-time link instead of waiting for
 * an admin invite. Always resolves to the same generic "check your email"
 * outcome -- see requestAssistantLink's comment for why.
 */
export function RequestLinkForm({ a }: { a: RequestLinkStrings }) {
  const [state, action, pending] = useActionState<RequestLinkState, FormData>(requestAssistantLink, {});

  if (state.sent) {
    return (
      <p className="mt-8 rounded-md border px-3 py-3 text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
        {a.requestSent}
      </p>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-3">
      <div>
        <label htmlFor="request-email" className="block text-sm" style={{ color: "var(--muted)" }}>
          {a.email}
        </label>
        <input
          id="request-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="you@azerconnect.az"
          className={FIELD}
          style={FIELD_STYLE}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {a.requestInvalid}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md px-4 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
      >
        {pending ? a.sending : a.requestSubmit}
      </button>
    </form>
  );
}
