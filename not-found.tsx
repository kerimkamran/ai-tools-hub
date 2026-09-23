import Link from "next/link";
import { Header } from "@/components/Header";
import { strings } from "@/lib/strings";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[640px] px-4 pb-24 pt-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          That page does not exist.
        </p>
        <p className="mt-8">
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
