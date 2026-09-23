import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { AccessBadge, PlannedBadge } from "@/components/AccessBadge";
import { getCatalogTools, getToolBySlug } from "@/lib/registry";
import { displayHost } from "@/lib/types";
import { strings } from "@/lib/strings";

export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
  const tools = await getCatalogTools();
  return tools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolBySlug(slug);
  if (!tool) return { title: "Not found" };

  return {
    title: tool.name,
    description: tool.tagline,
    alternates: { canonical: `/tools/${tool.slug}` },
    // `unlisted` stays reachable by direct link but out of search results.
    robots: tool.status === "unlisted" ? { index: false, follow: false } : undefined,
    openGraph: { title: tool.name, description: tool.tagline, type: "article" },
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = await getToolBySlug(slug);
  if (!tool) notFound();

  const planned = tool.status === "planned" || !tool.url;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[640px] px-4 pb-24 pt-10">
        <Link
          href="/"
          className="text-sm underline underline-offset-4 hover:opacity-70"
          style={{ color: "var(--muted)" }}
        >
          {strings.backToHub}
        </Link>

        <div className="mt-8 flex items-start gap-4">
          <span aria-hidden="true" className="text-4xl leading-none">
            {tool.icon}
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{tool.name}</h1>
            <p className="mt-1 text-[15px]" style={{ color: "var(--muted)" }}>
              {tool.tagline}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: "var(--faint)" }}>
            {tool.category}
          </span>
          <span aria-hidden="true" style={{ color: "var(--line-strong)" }}>·</span>
          {planned ? <PlannedBadge label={strings.comingSoon} /> : <AccessBadge access={tool.access} />}
        </div>

        {tool.accessNote && (
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            {tool.accessNote}
          </p>
        )}

        {tool.description && (
          <p className="mt-8 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
            {tool.description}
          </p>
        )}

        <div className="mt-10 border-t pt-8" style={{ borderColor: "var(--line)" }}>
          {planned ? (
            <p className="text-sm" style={{ color: "var(--faint)" }}>
              {strings.comingSoon}.
            </p>
          ) : (
            <>
              <a
                href={tool.url}
                target="_blank"
                rel="noopener"
                aria-label={`${strings.openTool(tool.name)} (${strings.opensInNewTab})`}
                className="inline-flex items-center gap-2 rounded-full px-5 text-sm font-medium transition-opacity hover:opacity-85"
                style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
              >
                {strings.openTool(tool.name)}
                <span aria-hidden="true">&rarr;</span>
              </a>
              <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>
                {displayHost(tool.url)} · {strings.opensInNewTab}
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
