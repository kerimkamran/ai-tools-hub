/**
 * Shared migration runner: applies every .sql file in db/migrations, in
 * filename order, each at most once (tracked in a `_migrations` table), each
 * inside its own transaction. Used by scripts/migrate.mts (by hand) and by
 * scripts/bootstrap.mts (automatically, on every start).
 */
import type { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function runMigrations(
  pool: Pool,
  dir: string,
  log: (msg: string) => void = console.log
): Promise<number> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  await pool.query(
    `create table if not exists _migrations (
       filename    text primary key,
       applied_at  timestamptz not null default now()
     )`
  );
  const { rows } = await pool.query<{ filename: string }>("select filename from _migrations");
  const applied = new Set(rows.map((r) => r.filename));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into _migrations (filename) values ($1)", [file]);
      await client.query("commit");
      log(`apply  ${file}`);
      count++;
    } catch (err) {
      await client.query("rollback");
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      client.release();
    }
  }
  return count;
}

export function poolSsl(connectionString: string) {
  return /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false };
}
