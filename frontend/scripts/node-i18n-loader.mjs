/**
 * Node module-loader hooks for running the i18n unit tests outside Next.
 *
 * The app resolves `@/` via tsconfig paths and imports JSON message bundles
 * with a bundler. Plain `node --experimental-strip-types --test` does neither,
 * so this loader adds exactly those two capabilities:
 *   1. `@/x`            → `<cwd>/src/x` (mirrors tsconfig `paths`).
 *   2. `*.json` imports → an ES module whose default export is the JSON value.
 *
 * Used only by `npm run test:i18n`. Not part of the app runtime or the
 * production build.
 */

import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  let base;
  if (specifier.startsWith("@/")) {
    // tsconfig `paths` alias: "@/x" → "<cwd>/src/x"
    base = path.join(ROOT, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    // Relative extensionless import (TS/Next convention) — resolve against the
    // importing file, then try the usual extensions.
    const parent = fileURLToPath(context.parentURL);
    base = path.resolve(path.dirname(parent), specifier);
  } else {
    return nextResolve(specifier, context);
  }

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`]) {
    if (fs.existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    const source = fs.readFileSync(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${source};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
