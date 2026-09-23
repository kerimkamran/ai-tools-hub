/**
 * One-time bootstrap: sets a password for a super admin so they can sign in
 * for the first time. Run this once per super-admin email, after running
 * the db/migrations and before the first sign-in attempt.
 *
 * There is no other way to create the FIRST credential row -- the in-app
 * invite flow (src/app/admin/team/actions.ts) requires an existing
 * signed-in super admin to generate an invite link, which is exactly the
 * chicken-and-egg problem this script exists to break. Every super admin
 * added later can either run this script again with their own email, or be
 * invited through the app once at least one super admin can sign in.
 *
 * Usage (from the project root, with DATABASE_URL set in the environment
 * or in .env.local):
 *
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/create-super-admin.mts you@example.com
 *
 * You'll be prompted for a password (not echoed on a real terminal). The
 * email must already be listed in SUPER_ADMIN_EMAILS for it to actually
 * reach /admin -- this script only sets a password, it does not grant
 * access on its own, matching the rest of the app's separation between
 * "can sign in" and "is authorized" (see db/migrations/0003_admin_auth.sql).
 */
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

/**
 * Asks two questions over ONE readline interface, consumed through its
 * async iterator rather than sequential `.question()` calls.
 *
 * `.question()` (the readline/promises API) attaches its "line" listener
 * only at the moment it's called. Over a piped, non-TTY stdin, Node drains
 * the whole input as fast as it arrives regardless of whether anything is
 * listening yet -- so by the time the SECOND `.question()` call attaches
 * its listener, the second line may already have been emitted and lost,
 * and that call hangs forever (confirmed by hand while building this
 * script: piping two lines in, the second question() never resolved and
 * the process just exited). The async-iterator form doesn't have this
 * problem -- readline buffers each line internally until something reads
 * it, so two `iterator.next()` calls in sequence reliably get one line
 * each, whether stdin is a terminal or piped input (e.g. a CI job setting
 * the password non-interactively).
 */
async function promptTwice(
  question1: string,
  question2: string
): Promise<[string, string]> {
  const rl = createInterface({ input: stdin, output: stdout });
  const isTTY = Boolean(stdin.isTTY);
  // @ts-expect-error -- _writeToOutput is undocumented but the standard way
  // Node's own docs demonstrate silencing readline echo for a password
  // prompt on a real terminal. No effect (and not needed) on piped input.
  const originalWrite = rl._writeToOutput?.bind(rl);

  const iter = rl[Symbol.asyncIterator]();
  async function ask(question: string): Promise<string> {
    if (isTTY && originalWrite) {
      stdout.write(question);
      // @ts-expect-error see above
      rl._writeToOutput = () => {};
    } else if (!isTTY) {
      // Echoing the prompt text still helps when output is captured/logged.
      stdout.write(question);
    }
    const { value, done } = await iter.next();
    if (isTTY) {
      stdout.write("\n");
      // @ts-expect-error see above -- restore normal echo before the next prompt
      if (originalWrite) rl._writeToOutput = originalWrite;
    }
    if (done) throw new Error("No more input while reading a password.");
    return value;
  }

  try {
    const a = await ask(question1);
    const b = await ask(question2);
    return [a, b];
  } finally {
    rl.close();
  }
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error(
      "Usage: node --env-file=.env.local --experimental-strip-types scripts/create-super-admin.mts you@example.com"
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const [password, confirm] = await promptTwice(
    `Password for ${email}: `,
    "Confirm password: "
  );

  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }
  if (password !== confirm) {
    console.error("Passwords did not match.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
  });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `insert into admin_credentials (email, password_hash, failed_attempts, locked_until)
       values ($1, $2, 0, null)
       on conflict (email) do update set
         password_hash = excluded.password_hash,
         failed_attempts = 0,
         locked_until = null`,
      [email, passwordHash]
    );
    console.log(`\nCredential set for ${email}.`);
    console.log(
      "Make sure this exact address is also listed in the SUPER_ADMIN_EMAILS environment variable -- a credential alone does not grant /admin access."
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
