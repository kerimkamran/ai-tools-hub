"use client";

import { useState } from "react";

/** A one-time link the admin copies and sends themselves (Render cannot email). */
export function CopyLink({ url, note }: { url: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-md border p-2" style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {note ?? "Send this link yourself — it isn't emailed. It works once and expires in 7 days."}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="One-time link"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded border px-2 py-2 text-xs"
          style={{ borderColor: "var(--control-border)", background: "var(--background)" }}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // clipboard can be blocked; the text is still selectable
            }
          }}
          className="shrink-0 rounded border px-3 text-xs"
          style={{ minHeight: 44, borderColor: "var(--control-border)" }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
