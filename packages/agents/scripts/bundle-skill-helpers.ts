/**
 * Build step: Bundle each TypeScript helper into a single self-contained `.mjs` placed inside the content tree.
 *
 * A helper installs to a platform directory outside the monorepo, so it cannot import a private workspace package.
 * esbuild bundles it with `@williamthorsen/kb` and its `yaml` / `zod` dependencies inlined, producing a file that runs
 * under `node` with no monorepo packages present on disk.
 * The bundle is written under `content/`, so a subsequent `copy-content.ts` carries it into `dist/content/`
 * and the dev and built layouts both ship the helper.
 *
 * A helper's destination follows its consumer: A skill's helper bundles into that skill's own directory under
 * `content/skills/`, while a helper with no skill to belong to — one the harness invokes, or one a subagent reaches
 * through the `{harness_home_dir}/scripts/` prefix — bundles into `content/scripts/`, alongside the shell helpers
 * that install to every harness home.
 *
 * The bundle list is a plain array of `BundleTarget` entries; a new helper registers itself by appending one.
 *
 * The bundles are tracked files, so `--check` guards them: It builds every target into a temporary directory and
 * compares the result against what git records at `HEAD`. The working tree is not a usable comparison target, since
 * this build step and the smoke test both rewrite `content/` in place before any check runs.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

/** Absolute path to the `codeassembly` package root. */
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A bundle whose tracked state no longer matches the target list that produces it. */
export interface BundleDrift {
  /** Path to the bundle, relative to the package root. */
  outFile: string;
  reason: DriftReason;
}

/** One helper to bundle: its TypeScript entry point and the `.mjs` output it produces. */
export interface BundleTarget {
  /** Path to the helper's entry module, relative to the package root. */
  entry: string;
  /** Path to the bundled output, relative to the package root. */
  outFile: string;
}

/** Why a bundle counts as drifted. */
export type DriftReason = 'differs' | 'orphaned' | 'unrecorded';

/** The bundles git records at `HEAD`, which a fresh build is checked against. */
export interface RecordedBundles {
  /** Returns the bytes git records for a bundle, or `undefined` where it records none. */
  read: (outFile: string) => Buffer | undefined;
  /** Every `.mjs` under `content/` that `HEAD` records, relative to the package root. */
  tracked: readonly string[];
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

/** Bundles every skill helper in `targets`, writing each `.mjs` under `outRoot` at the target's own relative path. */
export async function bundleSkillHelpers(outRoot: string = packageRoot): Promise<void> {
  for (const target of targets) {
    await build({
      entryPoints: [path.join(packageRoot, target.entry)],
      outfile: path.join(outRoot, target.outFile),
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
    console.info(`Bundled ${target.entry} -> ${path.join(outRoot, target.outFile)}`);
  }
}

/** Builds every target into a temporary directory and reports each bundle that has drifted from git's record. */
export async function checkSkillHelperBundles(): Promise<BundleDrift[]> {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-helper-bundles-'));
  try {
    await bundleSkillHelpers(outRoot);
    const built = new Map<string, Buffer>();
    for (const target of targets) {
      built.set(target.outFile, fs.readFileSync(path.join(outRoot, target.outFile)));
    }
    return findDriftedBundles(built, readRecordedBundles());
  } finally {
    fs.rmSync(outRoot, { force: true, recursive: true });
  }
}

/** Compares freshly built bundles against what git records, returning every bundle that drifted. */
export function findDriftedBundles(built: ReadonlyMap<string, Buffer>, recorded: RecordedBundles): BundleDrift[] {
  const drifted: BundleDrift[] = [];

  for (const [outFile, bytes] of built) {
    const recordedBytes = recorded.read(outFile);
    if (recordedBytes === undefined) {
      drifted.push({ outFile, reason: 'unrecorded' });
    } else if (!recordedBytes.equals(bytes)) {
      drifted.push({ outFile, reason: 'differs' });
    }
  }

  for (const outFile of recorded.tracked) {
    if (!built.has(outFile)) {
      drifted.push({ outFile, reason: 'orphaned' });
    }
  }

  return drifted;
}

/** Reads the bundles git records at `HEAD` for the package rooted at `packageDir`. */
export function readRecordedBundles(packageDir: string = packageRoot): RecordedBundles {
  // git addresses a blob by its repository-relative path. `--show-prefix` supplies the package's own leading segments,
  // where deriving them from `--show-toplevel` would break on any checkout reached through a symlink.
  const prefix = runGit(packageDir, ['rev-parse', '--show-prefix']).toString('utf8').trim();

  return {
    read: (outFile) => {
      try {
        return runGit(packageDir, ['cat-file', 'blob', `HEAD:${prefix}${outFile}`]);
      } catch {
        return;
      }
    },
    tracked: runGit(packageDir, ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'content'])
      .toString('utf8')
      .split('\n')
      .filter((line) => line.endsWith('.mjs')),
  };
}

/**
 * Output cap for one git invocation, sized well past a bundle. The 1 MiB default throws `ENOBUFS` on a larger blob,
 * which `read` cannot distinguish from an absent one, so the check would report a recorded bundle as unrecorded.
 */
const GIT_MAX_BUFFER = 64 * 1_024 * 1_024;

/** How each drift reason reads in the check's failure output. */
const driftMessages: Record<DriftReason, string> = {
  differs: 'differs from a fresh build',
  orphaned: 'is tracked but no target produces it',
  unrecorded: 'is not recorded at HEAD',
};

// Run as a build step, but stay importable (the smoke test reuses `targets` and `bundleSkillHelpers`).
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--check')) {
    const drifted = await checkSkillHelperBundles();
    for (const { outFile, reason } of drifted) {
      console.error(`${outFile} ${driftMessages[reason]}.`);
    }
    if (drifted.length > 0) {
      console.error('Run `nmr -F codeassembly build` and commit the regenerated bundles.');
      process.exitCode = 1;
    }
  } else {
    await bundleSkillHelpers();
  }
}

// region | Helpers

/** Runs git in `cwd` and returns its stdout. Throws when git exits non-zero. */
function runGit(cwd: string, args: readonly string[]): Buffer {
  return execFileSync('git', args, { cwd, maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
}

// endregion | Helpers
