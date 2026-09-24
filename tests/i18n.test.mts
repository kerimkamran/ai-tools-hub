/**
 * Phase C gate: "a missing AZ translation falls back to English rather than
 * rendering blank". Also checks that every locale dictionary has every key,
 * so a new English string cannot ship untranslated without a failure here.
 */
import { pickLocalized, sanitizeI18n, missingTranslations, isLocale, localePath } from "../src/lib/i18n.ts";
import { getStrings } from "../src/lib/strings.ts";

let fails = 0;
function check(name: string, ok: boolean) {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
}

const i18n = { az: { tagline: "Azərbaycanca" }, ru: { tagline: "   " } };
check("en always returns the base column", pickLocalized(i18n, "en", "tagline", "English") === "English");
check("az returns the translation", pickLocalized(i18n, "az", "tagline", "English") === "Azərbaycanca");
check("whitespace-only ru falls back to English", pickLocalized(i18n, "ru", "tagline", "English") === "English");
check("missing field falls back to English", pickLocalized(i18n, "az", "description" as "tagline", "Desc") === "Desc");
check("null map falls back to English", pickLocalized(null, "az", "tagline", "English") === "English");

const dirty = sanitizeI18n(
  { az: { tagline: "ok", evil: "<script>", name: 42 }, fr: { tagline: "non" }, ru: "nope" },
  ["tagline", "name"] as const
);
check("sanitize keeps known locale + known string keys only",
  JSON.stringify(dirty) === JSON.stringify({ az: { tagline: "ok" } }));
check("sanitize tolerates garbage", JSON.stringify(sanitizeI18n("x", ["a"] as const)) === "{}");

check("missingTranslations flags ru", JSON.stringify(missingTranslations(i18n, ["tagline"])) === '["ru"]');
check("missingTranslations ignores keys with no English value",
  missingTranslations({}, ["tagline"], () => false).length === 0);

check("isLocale accepts az", isLocale("az"));
check("isLocale rejects fr", !isLocale("fr"));
check("localePath builds /ru/about", localePath("ru", "/about") === "/ru/about");

const en = getStrings("en") as Record<string, unknown>;
for (const loc of ["az", "ru"] as const) {
  const d = getStrings(loc) as Record<string, unknown>;
  const missing = Object.keys(en).filter((k) => !(k in d));
  const sub = en.assistant as Record<string, unknown>;
  const subMissing = Object.keys(sub).filter((k) => !(k in (d.assistant as Record<string, unknown>)));
  check(`${loc} dictionary has every key`, missing.length === 0 && subMissing.length === 0);
}
check("tagline says we, not I", getStrings("en").tagline === "Everything we've built, in one place.");
const ru = getStrings("ru");
check("ru plural 1", ru.resultCount(1) === "1 инструмент");
check("ru plural 3", ru.resultCount(3) === "3 инструмента");
check("ru plural 5", ru.resultCount(5) === "5 инструментов");
check("ru plural 11", ru.resultCount(11) === "11 инструментов");
check("ru plural 21", ru.resultCount(21) === "21 инструмент");

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
