// Lets plain `node --experimental-strip-types` resolve the "@/..." alias that
// Next.js and TypeScript use, so pure modules can be tested as written.
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { pathToFileURL } from "node:url";
      import { existsSync } from "node:fs";
      const SRC = ${JSON.stringify(fileURLToPath(new URL("../src/", import.meta.url)))};
      export async function resolve(spec, ctx, next) {
        if (spec.startsWith("@/")) {
          const base = SRC + spec.slice(2);
          for (const f of [base + ".ts", base + ".tsx", base]) {
            if (existsSync(f)) return next(pathToFileURL(f).href, ctx);
          }
        }
        return next(spec, ctx);
      }
    `)
);
