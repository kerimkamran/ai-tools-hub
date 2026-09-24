/**
 * Fingerprint of an English source text, stored beside each translation so a
 * later edit to the English marks that translation STALE. Matches the SQL
 * function source_hash() in db/migrations/0007_content.sql (first 16 hex
 * characters of SHA-256 over the UTF-8 text).
 */
export { sourceHash } from "./translation-status";
