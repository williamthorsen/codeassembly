/**
 * Build step: bundle each skill's TypeScript helper into a single self-contained `.mjs` placed inside
 * the skill's content directory.
 *
 * A skill installs to a platform directory outside the monorepo, so it cannot import a private workspace
 * package. esbuild bundles the helper with `@codeassembly/kb-core` and its `yaml` / `zod` dependencies
 * inlined, producing a file that runs under `node` with no monorepo packages present on disk. The bundle
 * is written into `content/skills/`, so a subsequent `copy-content.ts` carries it into `dist/content/`
 * and the dev and built layouts both ship the helper.
 *
 * The bundle list is a plain array of `{ entry, outFile }` pairs; the sibling kb-add and kb-curate
 * skills extend it by appending an entry.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One skill helper to bundle: its TypeScript entry point and the `.mjs` output it produces. */
interface BundleTarget {
  /** Path to the helper's entry module, relative to the package root. */
  entry: string;
  /** Path to the bundled output, relative to the package root. */
  outFile: string;
}

const targets: BundleTarget[] = [
  {
    entry: 'src/kb-retrieve/cli.ts',
    outFile: 'content/skills/kb-retrieve/kb-retrieve.mjs',
  },
];

// A CommonJS dependency (`yaml`) reaches Node built-ins via bare `require('process')` calls. esbuild's
// ESM output otherwise has no `require`, so this banner restores a real one via `createRequire`.
const requireShim =
  "import { createRequire as __cjsCreateRequire } from 'node:module';\nconst require = __cjsCreateRequire(import.meta.url);";

for (const target of targets) {
  const outFile = path.join(packageRoot, target.outFile);
  await build({
    entryPoints: [path.join(packageRoot, target.entry)],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    banner: { js: requireShim },
    // Resolve `@codeassembly/kb-core` (and any future workspace dep) from its `source` `.ts` export
    // condition so the bundle does not require those packages to be pre-built.
    conditions: ['source'],
  });
  console.info(`Bundled ${target.entry} -> ${target.outFile}`);
}
