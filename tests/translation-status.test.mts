/**
 * Phase 2 gate: "editing an English tagline flags both of its translations
 * as stale". Plus missing / review / confirm behaviour, and that the JS hash
 * equals the SQL source_hash() used by the migration backfill.
 */
import { fieldStatus, nextMeta, sourceHash, tally } from "../src/lib/translation-status.ts";

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
};

// SQL: select left(encode(sha256(convert_to('Capture ideas, score them, and move the good ones forward.','UTF8')),'hex'),16)
check("hash matches SQL source_hash()", sourceHash("Capture ideas, score them, and move the good ones forward.") === "d65c6e18b4550f54");

const en1 = { tagline: "Old English" };
const values = { az: { tagline: "Köhnə" }, ru: { tagline: "Старый" } };
let meta = nextMeta({ english: en1, before: {}, after: values, meta: {} });
check("fresh translations are ok", fieldStatus(en1.tagline, "Köhnə", meta.az?.tagline) === "ok" && fieldStatus(en1.tagline, "Старый", meta.ru?.tagline) === "ok");

// English edited, translations untouched
const en2 = { tagline: "New English" };
meta = nextMeta({ english: en2, before: values, after: values, meta });
check("English edit flags AZ stale", fieldStatus(en2.tagline, "Köhnə", meta.az?.tagline) === "stale");
check("English edit flags RU stale", fieldStatus(en2.tagline, "Старый", meta.ru?.tagline) === "stale");

// Translator updates AZ only
const values2 = { az: { tagline: "Yeni" }, ru: { tagline: "Старый" } };
meta = nextMeta({ english: en2, before: values, after: values2, meta });
check("updated AZ is ok again", fieldStatus(en2.tagline, "Yeni", meta.az?.tagline) === "ok");
check("untouched RU still stale", fieldStatus(en2.tagline, "Старый", meta.ru?.tagline) === "stale");

// Confirm RU without changing it
meta = nextMeta({ english: en2, before: values2, after: values2, meta, confirm: [{ locale: "ru", field: "tagline" }] });
check("confirmed RU is ok", fieldStatus(en2.tagline, "Старый", meta.ru?.tagline) === "ok");

// AI draft = needs review
meta = nextMeta({ english: en2, before: values2, after: { ...values2, ru: { tagline: "Новый" } }, meta, review: true });
check("AI draft needs review", fieldStatus(en2.tagline, "Новый", meta.ru?.tagline) === "review");

check("missing", fieldStatus("x", "", undefined) === "missing");
check("no English = n/a", fieldStatus("", "y", undefined) === "na");
check("legacy (no meta) is ok", fieldStatus("x", "y", undefined) === "ok");
const t = tally(["ok", "ok", "missing", "stale", "na"]);
check("tally", t.total === 4 && t.ok === 2 && t.percent === 50);

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
