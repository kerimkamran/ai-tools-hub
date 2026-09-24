/**
 * Runs before the web server on every start (`npm start`), so a fresh
 * Render deployment needs no terminal:
 *
 *   1. applies any pending db/migrations
 *   2. seeds the starter catalog (db/seed.sql) if the tools table is EMPTY
 *      -- never on a catalog that already has rows, so deleted tools stay
 *      deleted
 *   3. gives every SUPER_ADMIN_EMAILS address a password from
 *      INITIAL_ADMIN_PASSWORD -- but ONLY if that address has no password
 *      yet. It never overwrites an existing one, so changing your password
 *      in the app sticks, and the env var can (and should) be deleted once
 *      you have signed in.
 *
 * Why an env var and not a password in the code: this repository is public.
 * A password -- or even its bcrypt hash -- committed here would be readable
 * by anyone. Render's environment variables are not.
 *
 * Never blocks the site from starting. Any failure is logged and the script
 * exits 0: the public catalog has a static fallback and must stay up even if
 * the database is briefly unreachable at boot.
 */
import pg from "pg";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations, poolSsl } from "./lib/migrations.mts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIN_PASSWORD_LENGTH = 12;

const log = (msg: string) => console.log(`[bootstrap] ${msg}`);

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log("DATABASE_URL not set -- skipping (the site runs on its static fallback).");
    return;
  }

  const pool = new pg.Pool({ connectionString, ssl: poolSsl(connectionString), max: 2 });
  try {
    const applied = await runMigrations(pool, join(ROOT, "db", "migrations"), log);
    log(applied ? `applied ${applied} migration(s)` : "database schema up to date");

    // Retention: stored assistant text lives 30 days, health history 30 days.
    const pruned = await pool.query("delete from assistant_transcripts where created_at < now() - interval '30 days'");
    await pool.query("delete from tool_health where checked_at < now() - interval '30 days'");
    if (pruned.rowCount) log(`deleted ${pruned.rowCount} assistant transcript(s) older than 30 days`);

    const { rows } = await pool.query<{ n: string }>("select count(*)::text as n from tools");
    if (Number(rows[0]?.n ?? 0) === 0) {
      await pool.query(await readFile(join(ROOT, "db", "seed.sql"), "utf8"));
      log("catalog was empty -- seeded the starter tools");
    }

    const emails = (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));
    const password = process.env.INITIAL_ADMIN_PASSWORD ?? "";

    if (emails.length === 0) {
      log("SUPER_ADMIN_EMAILS is empty -- nobody can sign in to /admin until it is set.");
    } else if (!password) {
      log("INITIAL_ADMIN_PASSWORD not set -- no admin passwords created (existing ones are untouched).");
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      log(`INITIAL_ADMIN_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters -- ignored. Choose a longer one.`);
    } else {
      const hash = await bcrypt.hash(password, 12);
      for (const email of emails) {
        // Creates the account, or fills in a password for an account row that
        // has none yet -- never replaces a password that is already set.
        const res = await pool.query(
          `insert into admin_credentials (email, password_hash) values ($1, $2)
           on conflict (email) do update set password_hash = excluded.password_hash
             where admin_credentials.password_hash is null`,
          [email, hash]
        );
        log(res.rowCount ? `password created for ${email}` : `${email} already has a password -- left unchanged`);
      }
      log("You can now delete INITIAL_ADMIN_PASSWORD from the environment.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // Deliberately exit 0: see the header comment.
  console.error("[bootstrap] failed (the site will still start):", err instanceof Error ? err.message : err);
});
