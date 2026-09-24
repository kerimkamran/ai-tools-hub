import { redirect } from "next/navigation";

/** Superseded by /admin/accounts (Admin Panel Plan, capability 1). Safe to delete this folder. */
export default function TeamPage() {
  redirect("/admin/accounts");
}
