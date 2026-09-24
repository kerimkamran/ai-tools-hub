"use client";

import { useEffect, useState } from "react";
import type { ToolHealth } from "@/lib/types";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

type HealthMap = Record<string, ToolHealth>;

let cache: HealthMap | null = null;
let inflight: Promise<HealthMap> | null = null;

/** One fetch per page load, shared by every card. */
function loadHealth(): Promise<HealthMap> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/health")
      .then((r) => (r.ok ? r.json() : { tools: {} }))
      .then((j: { tools?: HealthMap }) => {
        cache = j.tools ?? {};
        return cache;
      })
      .catch(() => ({}) as HealthMap)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Renders into space the card has already reserved, so resolving health can
 * never shift layout. `unknown` renders nothing at all -- absence of a signal
 * is not a negative signal.
 */
export function HealthDot({ toolId, locale }: { toolId: string; locale: Locale }) {
  const strings = getStrings(locale);
  const [state, setState] = useState<ToolHealth>("unknown");

  useEffect(() => {
    let alive = true;
    loadHealth().then((map) => {
      if (alive) setState(map[toolId] ?? "unknown");
    });
    return () => {
      alive = false;
    };
  }, [toolId]);

  if (state === "unknown") return null;

  const slow = state === "slow";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: slow ? "var(--warning)" : "var(--good)" }}
      />
      {slow ? strings.waking : strings.live}
    </span>
  );
}
