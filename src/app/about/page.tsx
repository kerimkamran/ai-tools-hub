import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: "About",
  description: "What this site is, and what it is not.",
};

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[640px] px-4 pb-24 pt-14">
        <h1 className="text-3xl font-semibold tracking-tight">{strings.about}</h1>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
          <p>
            This is a directory, not a platform. Each tool listed here is its own
            application, built and deployed independently. Opening one takes you
            to that application on its own address.
          </p>
          <p>
            The directory itself has no accounts and asks for nothing. Some of
            the tools do have their own sign-in, and where that is true the card
            says so before you click.
          </p>
        </div>
        <p className="mt-10">
          <Link
            href="/"
            className="text-sm underline underline-offset-4 hover:opacity-70"
            style={{ color: "var(--foreground)" }}
          >
            {strings.backToHub}
          </Link>
        </p>
      </main>
    </>
  );
}
