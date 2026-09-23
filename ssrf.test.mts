/**
 * Security regression test for the SSRF validator.
 *
 * This is deliberately the only test in the repo. The catalog is small enough
 * that a UI test suite would cost more to maintain than it catches, but this
 * control guards a server-side fetch driven by admin-entered input -- the
 * highest-severity surface here -- so it gets a test that runs in one second
 * with no framework.
 *
 *   npm run test:ssrf
 */
import { checkPublicHttpsUrl } from "../src/lib/validate.ts";

const MUST_REJECT = [
  "http://example.com/health",              // plain http
  "https://127.0.0.1/health",               // loopback v4
  "https://localhost/health",               // loopback name
  "https://169.254.169.254/latest/meta-data", // cloud metadata
  "https://10.0.0.5/health",                // private A
  "https://192.168.1.1/health",             // private C
  "https://172.16.0.1/health",              // private B
  "https://172.31.255.1/health",            // private B upper edge
  "https://[::1]/health",                   // loopback v6
  "https://[fc00::1]/health",               // unique-local v6
  "https://[fe80::1]/health",               // link-local v6
  "https://internal-api.internal/health",   // .internal
  "https://printer.local/health",           // .local
  "https://intranet/health",                // no dot
  "https://user:pw@example.com/health",     // embedded credentials
  "file:///etc/passwd",                     // wrong scheme
  "javascript:alert(1)",                    // scheme injection
  "data:text/html,<script>",                // data URI
  "not-a-url",                              // malformed
  "https://LOCALHOST/health",               // case
  "https://8.8.8.8/health",                 // bare public IP still refused
  "https://localhost./health",              // trailing dot, same host to a resolver
  "https://box.internal./health",           // trailing dot + .internal
  "https://127.0.0.1./health",              // trailing dot + loopback
  "https://LoCaLhOsT/health",               // mixed case
  "https://192.168.0.1:8080/health",        // private with explicit port
];

const MUST_ACCEPT = [
  "https://sparklab-azerconnect.onrender.com/api/health",
  "https://vantage-ag.vercel.app",
  "https://example.co.uk/health",
  "https://sub.domain.example.com:8443/health",  // non-default port on a public host
];

let fails = 0;
console.log("--- must REJECT ---");
for (const u of MUST_REJECT) {
  const r = checkPublicHttpsUrl(u);
  const ok = !r.ok;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "LEAK"}  ${u}${ok ? "" : "  <-- ACCEPTED, should not be"}`);
}
console.log("--- must ACCEPT ---");
for (const u of MUST_ACCEPT) {
  const r = checkPublicHttpsUrl(u);
  if (!r.ok) fails++;
  console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${u}${r.ok ? "" : "  <-- rejected: " + (r as any).reason}`);
}
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
