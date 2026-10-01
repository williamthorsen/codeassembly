import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { printLine } from '../lib/emit-report.ts';
import { bundleHelpers, checkHelperBundles, type DriftReason } from '../lib/helper-bundler.ts';
import { readHelperTargets } from '../lib/helper-manifest.ts';
import { resolveContentRoot } from '../lib/resolve-content-root.ts';

/** What `bundle-helpers` was asked to do: an explicit content root, and whether to check rather than build. */
export interface BundleHelpersOptions {
  readonly check: boolean;
  readonly content?: string | undefined;
}

/**
 * Builds the helpers that a content root's manifest declares, or with `check` reports each bundle that has drifted from
 * git's record, returning whether the run succeeded. Returns a boolean rather than throwing so that the caller can exit
 * non-zero on a multi-line drift report without the CLI's top-level handler prefixing it with `Error:`.
 */
export async function bundleHelpersCommand(
  options: BundleHelpersOptions,
  cwd: string = process.cwd(),
): Promise<boolean> {
  const root = await resolveContentRoot(options.content, cwd, 'bundle helpers from');
  await assertDirectory(root);
  const targets = await readHelperTargets(root);

  if (!options.check) {
    await bundleHelpers(targets, root);
    for (const target of targets) {
      printLine({ glyph: 'passed', level: 'info', text: `Bundled ${target.entry} -> ${target.out}` });
    }
    return true;
  }

  const drifted = await checkHelperBundles(root, targets);
  if (drifted.length === 0) {
    printLine({ glyph: 'passed', level: 'info', text: `Every bundle under ${root} matches a fresh build.` });
    return true;
  }

  for (const { out, reason } of drifted) {
    printLine({ glyph: 'failed', level: 'error', text: `${out} ${driftMessages[reason]}.` });
  }
  const command =
    options.content === undefined
      ? 'codeassembly bundle-helpers'
      : `codeassembly bundle-helpers --content ${options.content}`;
  console.error(`Run \`${command}\` and commit the regenerated bundles.`);
  return false;
}

/** How each drift reason reads in the check's failure output. */
const driftMessages: Record<DriftReason, string> = {
  differs: 'differs from a fresh build',
  orphaned: 'is tracked but not produced by any helper',
  unrecorded: 'is not recorded at HEAD',
};

// region | Helpers

/** Throws when `root` is not a directory, so a mistyped path does not read as a root without helpers. */
async function assertDirectory(root: string): Promise<void> {
  let isDirectory = false;
  try {
    isDirectory = (await stat(root)).isDirectory();
  } catch {
    // An unreadable or absent root reports the same way as a file in its place.
  }
  if (!isDirectory) {
    throw new Error(`Content root ${path.normalize(root)} is not a directory.`);
  }
}

// endregion | Helpers
