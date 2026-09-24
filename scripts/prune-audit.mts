/**
 * Deletes audit_log rows older than 12 months -- the ONLY way rows ever
 * leave that table. The append-only trigger allows a DELETE only when the
 * transaction-local flag onesimple.audit_prune is 'on' AND the row is older
 * than 12 months, so even this script cannot remove recent history.
 *
 * Usage: DATABASE_URL=... node --experimental-strip-types scripts/prune-audit.mts
 */
import pg from "pg";
import { poolSsl } from "./lib/migrations.mts";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString, ssl: poolSsl(connectionString) });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local onesimple.audit_prune = 'on'");
    const res = await client.query("delete from audit_log where at < now() - interval '12 months'");
    await client.query("commit");
    console.log(`Pruned ${res.rowCount ?? 0} audit row(s) older than 12 months.`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
