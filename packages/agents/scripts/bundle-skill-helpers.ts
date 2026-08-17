/**
 * Build step: Bundle each TypeScript helper into a single self-contained `.mjs` placed inside the content tree.
 *
 * A helper installs to a platform directory outside the monorepo, so it cannot import a private workspace package.
 * esbuild bundles it with `@williamthorsen/kb` and its `yaml` / `zod` dependencies inlined, producing a file that runs
 * under `node` with no monorepo packages present on disk.
 * The bundle is written under `content/`, so a subsequent `copy-content.ts` carries it into `dist/content/`
 * and the dev and built layouts both ship the helper.
 *
 * A helper's destination follows its consumer: a skill's helper bundles into that skill's own directory under
 * `content/skills/`, while a helper with no skill to belong to — one the harness invokes, or one a subagent reaches
 * through the `{harness_home_dir}/scripts/` prefix — bundles into `content/scripts/`, alongside the shell helpers
 * that install to every harness home.
 *
 * The bundle list is a plain array of `BundleTarget` entries; a new helper registers itself by appending one.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

/** Absolute path to the `codeassembly` package root. */
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One helper to bundle: its TypeScript entry point and the `.mjs` output it produces. */
export interface BundleTarget {
  /** Path to the helper's entry module, relative to the package root. */
  entry: string;
  /** Path to the bundled output, relative to the package root. */
  outFile: string;
}

/** Every helper bundle; the smoke test reuses this list to exercise each built `.mjs`. */
export const targets: BundleTarget[] = [
  {
    entry: 'src/kb-add/cli.ts',
    outFile: 'content/skills/kb-add/kb-add.mjs',
  },
  {
    entry: 'src/kb-edit/cli.ts',
    outFile: 'content/skills/kb-edit/kb-edit.mjs',
  },
  {
    entry: 'src/kb-curate/cli.ts',
    outFile: 'content/skills/kb-curate/kb-curate.mjs',
  },
  {
    entry: 'src/kb-retrieve/cli.ts',
    outFile: 'content/skills/kb-retrieve/kb-retrieve.mjs',
  },
  {
    entry: 'src/kb-retrieve-events/cli.ts',
    outFile: 'content/skills/kb-retrieve-events/kb-retrieve-events.mjs',
  },
  {
    entry: 'src/update-jira-ticket/cli.ts',
    outFile: 'content/skills/update-jira-ticket/update-jira-ticket.mjs',
  },
  {
    entry: 'src/derive-session-context/cli.ts',
    outFile: 'content/skills/derive-session-context/derive-session-context.mjs',
  },
  {
    entry: 'src/capture-event/cli.ts',
    outFile: 'content/skills/capture-event/capture-event.mjs',
  },
  {
    entry: 'src/capture-lede-decision/cli.ts',
    outFile: 'content/skills/capture-lede-decision/capture-lede-decision.mjs',
  },
  {
    entry: 'src/kb-update-events/cli.ts',
    outFile: 'content/skills/kb-update-events/kb-update-events.mjs',
  },
  {
    entry: 'src/feedback-memories/cli.ts',
    outFile: 'content/skills/migrate-feedback-memories/feedback-memories.mjs',
  },
  {
    entry: 'src/emit-event/cli.ts',
    outFile: 'content/skills/emit-event/emit-event.mjs',
  },
  {
    entry: 'src/relay-hook-event/cli.ts',
    outFile: 'content/scripts/relay-hook-event.mjs',
  },
  {
    entry: 'src/select-lede-exemplars/cli.ts',
    outFile: 'content/scripts/select-lede-exemplars.mjs',
  },
];

// A CommonJS dependency (`yaml`) reaches Node built-ins via bare `require('process')` calls.
// esbuild's ESM output otherwise has no `require`, so this banner restores a real one via `createRequire`.
const requireShim =
  "import { createRequire as __cjsCreateRequire } from 'node:module';\nconst require = __cjsCreateRequire(import.meta.url);";

/** Bundles every skill helper in `targets`, writing each `.mjs` into its skill's content directory. */
export async function bundleSkillHelpers(): Promise<void> {
  for (const target of targets) {
    await build({
      entryPoints: [path.join(packageRoot, target.entry)],
      outfile: path.join(packageRoot, target.outFile),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'es2022',
      banner: { js: requireShim },
      minify: true,
      // Keeps a deployed helper's stack traces legible.
      keepNames: true,
      // Resolve `@williamthorsen/kb` (and any future workspace dep) from its `source` `.ts` export
      // condition so the bundle does not require those packages to be pre-built.
      conditions: ['source'],
    });
    console.info(`Bundled ${target.entry} -> ${target.outFile}`);
  }
}

// Run as a build step, but stay importable (the smoke test reuses `targets` and `bundleSkillHelpers`).
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await bundleSkillHelpers();
}
