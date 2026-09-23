/**
 * Applies every .sql file in db/migrations, in filename order, to
 * DATABASE_URL. Tracks what's already been applied in a `_migrations`
 * table, so it's safe to run repeatedly -- each file runs at most once.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types scripts/migrate.mts
 * or, with DATABASE_URL already exported in the shell:
 *   npm run migrate
 */
import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "db", "migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found in db/migrations.");
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
  });

  try {
    await pool.query(
      `create table if not exists _migrations (
         filename    text primary key,
         applied_at  timestamptz not null default now()
       )`
    );

    const { rows: applied } = await pool.query<{ filename: string }>(
      "select filename from _migrations"
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`skip   ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into _migrations (filename) values ($1)", [file]);
        await client.query("commit");
        console.log(`apply  ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : err}`);
      } finally {
        client.release();
      }
    }

    console.log("\nAll migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
