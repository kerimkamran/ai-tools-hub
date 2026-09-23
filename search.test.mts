/**
 * Search behaviour: diacritic folding and multi-word AND matching.
 * Kept because the AZ/RU/EN audience makes folding a real requirement, not a
 * nicety, and a corrupted character range would fail silently.
 */
import { normalize, matches } from "../src/lib/search.ts";

const cases: Array<[string, string, boolean]> = [
  ["Azərbaycan Research", "azerbaycan", true],   // ə folded
  ["Azərbaycan Research", "azərbaycan", true],   // exact with diacritic
  ["Competency Assessments HR", "hr assess", true],  // multi-word AND
  ["Competency Assessments HR", "assess hr", true],  // order-independent
  ["Competency Assessments HR", "hr zzz", false],    // AND, not OR
  ["SparkLab Innovation", "spark", true],
  ["SparkLab Innovation", "", true],             // empty query matches all
  ["Ünïcôdé Tôôl", "unicode tool", true],        // combining marks stripped
];

let fails = 0;
for (const [hay, q, expected] of cases) {
  const got = matches(normalize(hay), q);
  const ok = got === expected;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${JSON.stringify(hay)} ~ ${JSON.stringify(q)} -> ${got} (expected ${expected})`);
}
console.log(`\nnormalize("Azərbaycan") = ${JSON.stringify(normalize("Azərbaycan"))}`);
console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
