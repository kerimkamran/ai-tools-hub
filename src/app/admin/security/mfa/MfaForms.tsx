"use client";

import { useActionState } from "react";
import {
  confirmMfaSetup,
  disableOwnMfa,
  regenerateRecoveryCodes,
  startMfaSetup,
  type MfaState,
} from "../actions";

const FIELD = "mt-1 block w-40 rounded-md border px-3 py-2 text-lg tracking-widest outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)" };
const PRIMARY = { minHeight: 44, background: "var(--foreground)", color: "var(--background)" };

function Codes({ codes }: { codes?: string[] }) {
  if (!codes?.length) return null;
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--warning)" }} role="status">
      <p className="text-sm font-medium">Your recovery codes — shown once</p>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        Save them somewhere safe (a password manager). Each works once if you lose your phone.
      </p>
      <ul className="mt-3 grid list-none grid-cols-2 gap-1 p-0 font-mono text-sm">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </div>
  );
}

function Msg({ s }: { s: MfaState }) {
  return (
    <>
      {s.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{s.error}</p>}
      {s.ok && <p role="status" className="text-sm" style={{ color: "var(--good)" }}>{s.ok}</p>}
    </>
  );
}

function CodeInput({ label }: { label: string }) {
  return (
    <label className="block text-sm" style={{ color: "var(--muted)" }}>
      {label}
      <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7}
        className={FIELD} style={FIELD_STYLE} />
    </label>
  );
}

/**
 * One client component for every state of the page, rendered at the same
 * place in the tree -- so when turning MFA on re-renders the server page
 * (the session cookie is re-issued), React keeps this component's state and
 * the one-time recovery codes stay on screen instead of vanishing.
 */
export function MfaPanel(p: {
  enabled: boolean;
  canDisable: boolean;
  codesLeft: number;
  qr: string | null;
  manualKey: string | null;
}) {
  const [confirm, runConfirm, confirming] = useActionState<MfaState, FormData>(confirmMfaSetup, {});
  const [regen, runRegen, regenerating] = useActionState<MfaState, FormData>(regenerateRecoveryCodes, {});
  const [off, runOff, turningOff] = useActionState<MfaState, FormData>(disableOwnMfa, {});
  const codes = regen.recoveryCodes ?? confirm.recoveryCodes;

  return (
    <div className="mt-8 space-y-6">
      <Codes codes={codes} />

      {p.enabled ? (
        <>
          <p className="text-sm font-medium" style={{ color: "var(--good)" }}>● On</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{p.codesLeft} recovery code(s) left.</p>
          <form action={runRegen} className="space-y-2">
            <CodeInput label="Code from your app" />
            <Msg s={regen} />
            <button type="submit" disabled={regenerating} className="rounded-md px-5 text-sm font-medium disabled:opacity-50" style={PRIMARY}>
              {regenerating ? "Checking…" : "Generate new recovery codes"}
            </button>
          </form>
          {p.canDisable && (
            <details className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
              <summary className="cursor-pointer text-sm">Turn off two-step verification</summary>
              <form action={runOff} className="mt-3 space-y-2">
                <CodeInput label="Code from your app" />
                <Msg s={off} />
                <button type="submit" disabled={turningOff} className="rounded-md border px-5 text-sm"
                  style={{ minHeight: 44, borderColor: "var(--critical)", color: "var(--critical)" }}>
                  Turn off and sign out everywhere
                </button>
              </form>
            </details>
          )}
        </>
      ) : p.qr && p.manualKey ? (
        <section className="space-y-4">
          <p className="text-sm">1. Scan this with your authenticator app:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded border bg-white p-2" />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Can&apos;t scan? Enter this key by hand: <code className="font-mono">{p.manualKey}</code>
          </p>
          <p className="text-sm">2. Confirm with the code it shows:</p>
          <form action={runConfirm} className="space-y-2">
            <CodeInput label="Enter the 6-digit code your app shows" />
            <Msg s={confirm} />
            <button type="submit" disabled={confirming} className="rounded-md px-5 text-sm font-medium disabled:opacity-50" style={PRIMARY}>
              {confirming ? "Checking…" : "Turn on"}
            </button>
          </form>
        </section>
      ) : (
        <form action={startMfaSetup}>
          <button type="submit" className="rounded-md px-5 text-sm font-medium" style={PRIMARY}>
            Set up two-step verification
          </button>
        </form>
      )}
    </div>
  );
}
