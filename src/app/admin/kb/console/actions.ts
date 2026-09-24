"use server";

import { requirePermission } from "@/lib/auth";
import { getCatalogTools } from "@/lib/registry";
import { getAllArticlesForAdmin, getPublishedArticles } from "@/lib/kb";
import { assistantSystem, wrapQuestion } from "@/lib/assistant-prompt";
import { completeText } from "@/lib/ai-engine";
import { MAX_QUESTION_CHARS } from "@/lib/assistant-limits";
import { isLocale } from "@/lib/i18n";

export type ConsoleState = { error?: string; answer?: string; question?: string; usedDrafts?: boolean; costUsd?: number };

/**
 * The knowledge base test console (capability 7): ask the assistant a
 * question with the DRAFT articles included, before publishing anything.
 * Same instructions and context builder as /api/assistant; nothing is
 * published and no text is stored. Counts against the monthly AI budget.
 */
export async function askConsole(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const user = await requirePermission("kb.draft");
  const question = String(formData.get("question") ?? "").trim();
  const localeRaw = String(formData.get("locale") ?? "en");
  const locale = isLocale(localeRaw) ? localeRaw : "en";
  const withDrafts = formData.get("drafts") === "on";
  if (!question) return { error: "Type a question." };
  if (question.length > MAX_QUESTION_CHARS) return { error: `Keep it under ${MAX_QUESTION_CHARS} characters.`, question };

  const [tools, articles] = await Promise.all([
    getCatalogTools(),
    withDrafts ? getAllArticlesForAdmin() : getPublishedArticles(),
  ]);
  const res = await completeText({
    email: user.email,
    purpose: "kb_console",
    system: assistantSystem(tools, articles),
    user: wrapQuestion(question, locale),
    maxTokens: 2048,
  });
  if (!res.ok) return { error: res.message, question };
  return { answer: res.text, question, usedDrafts: withDrafts, costUsd: res.costUsd };
}
