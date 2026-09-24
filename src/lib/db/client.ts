import "server-only";
import { Pool, type QueryResultRow } from "pg";

/**
 * THE single connection point to Postgres (Render or any other host). Every
 * query in the app goes through `query()` below and nowhere else -- same
 * discipline as src/lib/registry.ts's "THE SEAM" comment, just one layer
 * lower.
 *
 * There is deliberately one client, not a "public" and an "admin" one:
 * Postgres has no public REST surface -- this pool is only ever reachable
 * from server-side Next.js code, never from a browser. Instead, every query that must
 * stay public-safe (the catalog, site settings) filters explicitly in its
 * own SQL (`where status in (...)`) rather than relying on a database role.
 * See registry.ts and settings.ts for where that filtering happens.
 */

let pool: Pool | null = null;

export function hasDatabaseConfig(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      // Render's managed Postgres (and most hosted Postgres) terminates TLS
      // with a certificate that Node's default CA bundle does not chain to.
      // rejectUnauthorized: false keeps the connection encrypted in transit
      // without requiring the specific CA bundle to be vendored in -- the
      // same trade-off Render's own connection-string docs make. Local
      // Postgres (no sslmode, no cloud host) skips TLS entirely.
      ssl: /localhost|127\.0\.0\.1/.test(connectionString)
        ? false
        : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (err) => {
      // A dropped idle connection must not crash the process -- pg emits
      // this asynchronously outside any query's own try/catch.
      console.error("[db] idle client error:", err);
    });
  }
  return pool;
}

/** Runs one parameterized query and returns its rows. Never build SQL by
 *  string-concatenating user input -- every call site uses `$1, $2, ...`
 *  placeholders, which pg sends as a separate parameter list, not text
 *  substituted into the query. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** Single-row convenience wrapper. Returns null rather than throwing on an
 *  empty result -- most call sites want "not found", not an exception. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** What a transaction callback can run -- the same two helpers as above,
 *  bound to one connection so every statement shares the transaction. */
export type Tx = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;
  queryOne: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<T | null>;
};

/**
 * Runs `fn` inside BEGIN/COMMIT on one pooled connection, rolling back on
 * any throw. The Admin Panel Plan's rule: an admin change and its audit row
 * are written in the same transaction, so there is never a change without a
 * record or a record without a change.
 */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const tx: Tx = {
    query: async (text, params = []) => (await client.query(text, params)).rows,
    queryOne: async (text, params = []) => (await client.query(text, params)).rows[0] ?? null,
  };
  try {
    await client.query("begin");
    const result = await fn(tx);
    await client.query("commit");
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // connection already broken -- nothing more to undo
    }
    throw err;
  } finally {
    client.release();
  }
}
