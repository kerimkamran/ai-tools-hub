import type { Metadata } from "next";
import { AdminNav } from "./AdminNav";

/**
 * The admin surface is never indexed. This sits alongside the Disallow in
 * robots.ts -- robots.txt is a request, a noindex directive is an instruction.
 */
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AdminNav />
      {children}
    </div>
  );
}
