import "server-only";
import { cache } from "react";
import { hasDatabaseConfig, query } from "@/lib/db/client";
import type { Locale } from "@/lib/i18n";

/**
 * Site-wide announcements (capability 10). Which ones show is decided at
 * RENDER time; public pages revalidate every 60 s, so a banner appears and
 * disappears on schedule within the minute, with no cron.
 */
export type Severity = "info" | "warning" | "critical";
export type Announcement = { id: number; severity: Severity; text: string };

type Row = { id: string; severity: Severity; text_en: string; text_az: string; text_ru: string };

export const getActiveAnnouncements = cache(async (locale: Locale): Promise<Announcement[]> => {
  if (!hasDatabaseConfig()) return [];
  try {
    const rows = await query<Row>(
      `select id::text, severity, text_en, text_az, text_ru from announcements
        where starts_at <= now() and (ends_at is null or ends_at > now())
        order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end, starts_at desc
        limit 3`
    );
    return rows.map((r) => ({
      id: Number(r.id),
      severity: r.severity,
      text: (locale === "az" && r.text_az) || (locale === "ru" && r.text_ru) || r.text_en,
    }));
  } catch {
    return [];
  }
});
