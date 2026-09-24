/**
 * TOTP against the RFC 6238 Appendix B test vectors, plus replay refusal,
 * drift window and base32 round-trip. Security code that fails silently
 * (every code "valid", or none) is exactly what this catches.
 */
import { totpAt, verifyTotp, base32Encode, base32Decode, newRecoveryCodes, normalizeRecoveryCode } from "../src/lib/totp.ts";

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
};

const seed = Buffer.from("12345678901234567890");
const vectors: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];
for (const [t, want] of vectors) {
  check(`RFC 6238 SHA1 t=${t}`, totpAt(seed, Math.floor(t / 30), 8) === want);
}

check("base32 round-trip", base32Decode(base32Encode(seed)).equals(seed));
const b32 = base32Encode(seed);
const t = 1111111111 * 1000;
const code = totpAt(seed, Math.floor(t / 1000 / 30));
const step = verifyTotp(b32, code, null, t);
check("current code accepted", step === Math.floor(t / 1000 / 30));
check("same code refused once used (replay)", verifyTotp(b32, code, step, t) === null);
check("previous step accepted (drift)", verifyTotp(b32, totpAt(seed, Math.floor(t / 1000 / 30) - 1), null, t) !== null);
check("two steps old refused", verifyTotp(b32, totpAt(seed, Math.floor(t / 1000 / 30) - 2), null, t) === null);
check("wrong code refused", verifyTotp(b32, "000000", null, t) === null || totpAt(seed, Math.floor(t / 1000 / 30)) === "000000");
check("non-digits refused", verifyTotp(b32, "12a456", null, t) === null);

const codes = newRecoveryCodes();
check("10 recovery codes, unique", codes.length === 10 && new Set(codes).size === 10);
check("recovery code format", codes.every((c) => /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(c)));
check("recovery normalize", normalizeRecoveryCode(" AB CD-EF GH ") === "abcd-efgh");

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
