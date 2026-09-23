import Link from "next/link";
import { strings } from "@/lib/strings";
import { ThemeToggle } from "./ThemeToggle";

/** A small wordmark and a theme toggle. Nothing else belongs here. */
export function Header() {
  return (
    <header
      className="sticky top-0 z-10 border-b backdrop-blur"
      style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--background) 88%, transparent)" }}
    >
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight hover:opacity-70"
          style={{ color: "var(--foreground)" }}
        >
          {strings.brand}
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/about"
            className="rounded px-3 py-2 text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            {strings.about}
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
