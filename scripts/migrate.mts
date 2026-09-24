/**
 * Applies every pending .sql file in db/migrations to DATABASE_URL. Safe to
 * run repeatedly -- each file runs at most once. You normally do not need
 * this by hand any more: `npm start` runs scripts/bootstrap.mts first, which
 * applies pending migrations automatically.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types scripts/migrate.mts
 * or, with DATABASE_URL already exported in the shell:
 *   npm run migrate
 */
import pg from "pg";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations, poolSsl } from "./lib/migrations.mts";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString, ssl: poolSsl(connectionString) });
  try {
    const n = await runMigrations(pool, join(__dirname, "..", "db", "migrations"));
    console.log(n ? `\nApplied ${n} migration(s).` : "Nothing to apply -- already up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
