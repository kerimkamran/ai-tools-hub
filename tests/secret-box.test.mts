/**
 * The provider key's encryption at rest (Phase D): round-trips, refuses a
 * tampered ciphertext, and refuses a different key.
 * Run with --conditions=react-server so the `server-only` marker resolves.
 */
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
delete process.env.SETTINGS_ENCRYPTION_KEY;
const { sealSecret, openSecret, encryptionKeySource } = await import("../src/lib/secret-box.ts");

let fails = 0;
function check(name: string, ok: boolean) {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
}

const key = "sk-ant-api03-EXAMPLEexampleEXAMPLEexample";
const sealed = sealSecret(key);
check("sealed value is versioned", sealed.startsWith("v1:"));
check("sealed value does not contain the key", !sealed.includes("EXAMPLE"));
check("round-trips", openSecret(sealed) === key);
check("two seals differ (random IV)", sealSecret(key) !== sealed);
check("derived key source reported", encryptionKeySource() === "derived");

const raw = Buffer.from(sealed.slice(3), "base64");
raw[raw.length - 1] ^= 1;
check("tampered ciphertext is refused", openSecret(`v1:${raw.toString("base64")}`) === null);
check("garbage is refused", openSecret("v1:AAAA") === null && openSecret("nope") === null && openSecret(null) === null);

process.env.SETTINGS_ENCRYPTION_KEY = "a-different-dedicated-key-that-is-long-enough";
check("dedicated key source reported", encryptionKeySource() === "dedicated");
check("a different key cannot open it", openSecret(sealed) === null);

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
