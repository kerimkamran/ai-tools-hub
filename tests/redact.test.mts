/**
 * Secrets never enter the audit log or an export. Includes the plan's
 * sentinel-key idea at the unit level: a key-shaped value is removed
 * wherever it appears, even under an innocent-looking field name.
 */
import { redactForAudit, keyRotationNote } from "../src/lib/redact.ts";

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
};

const SENTINEL = "sk-ant-api03-SENTINELsentinelSENTINELsentinel0000";
const input = {
  model: "claude-opus-5-5",
  api_key_encrypted: "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  password_hash: "$2b$12$abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxy",
  totp_secret_encrypted: "v1:BBBB",
  recovery_codes_hash: ["aa", "bb"],
  apiKey: SENTINEL,
  note: `pasted by mistake: ${SENTINEL}`,
  nested: { token_hash: "abc", ok: "fine" },
  last4: "1234",
};
const out = JSON.stringify(redactForAudit(input));
check("sentinel key appears nowhere", !out.includes("SENTINEL"));
check("password hash removed", !out.includes("$2b$"));
check("ciphertext removed", !out.includes("v1:AAAA") && !out.includes("v1:BBBB"));
check("recovery hashes removed", !out.includes('"aa"'));
check("harmless fields kept", out.includes("claude-opus-5-5") && out.includes('"fine"'));
check("last4 kept", out.includes('"1234"'));
check("rotation note", keyRotationNote("a1b2") === "rotated, last4 …a1b2" && keyRotationNote(null) === "removed");

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
