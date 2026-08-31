/* eslint n/no-process-exit: off -- CLI entry point: the helper's resolved exit code must reach the OS, and this module runs `main` only behind the `isEntryPoint()` guard, never when imported as a library; throwing-to-set-exitCode would lose the explicit failure-exit contract. */
/* eslint unicorn/no-process-exit: off -- same as above: `process.exit` is the correct termination mechanism at the process boundary, not a library-internal anti-pattern here. */
/**
 * CLI entry for the revise-object-relatives sweep.
 *
 * Positional arguments narrow the sweep to the files they name or contain; with none, the sweep covers the whole
 * repository. JSON on stdout is the only output: the human-readable report is the agent's, composed once each
 * candidate has been adjudicated.
 *
 * The helper has no write mode. Repairs land through the agent's own editing tool, which keeps one write path and
 * leaves the harness its file tracking.
 */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { scanFlags } from '../lib/parse-flags.ts';
import { collectProse, NotARepositoryError } from './collect-prose.ts';
import { detectCandidates } from './detect.ts';
import type { Candidate, CandidateSummary, DetectResult, FileCount, ParsedArgs, SubjectShape } from './types.ts';

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runDetect({ argv: process.argv.slice(2), root: process.cwd() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // The helper's contract is exit 0 with a structured `{ ok: false, ... }` for recoverable failures.
    // System failures (unexpected throws) take the catch arm below.
  } catch (error) {
    process.stderr.write(`revise-object-relatives: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv, which is positional-only: each argument is a path narrowing the sweep. Any `--`-prefixed
 * token throws with a usage-style message, since no flag is recognized.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  return { paths: scanFlags(argv, []).positionals };
}

/**
 * Runs the helper end to end: parses args, sweeps the repository, detects every candidate, and summarizes the set by
 * file and by shape. Invalid args and a root outside a git working tree become structured `{ ok: false, ... }`
 * results; anything else propagates to `main`'s try/catch.
 *
 * @internal - Exported to allow testing.
 */
export async function runDetect(input: {
  argv: readonly string[];
  root: string;
  home?: string;
}): Promise<DetectResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return { ok: false, error: 'invalid-args', message: describeError(error) };
  }

  try {
    const { files, spans } = await collectProse({
      root: input.root,
      paths: args.paths,
      ...(input.home !== undefined && { home: input.home }),
    });
    const candidates = detectCandidates(spans);
    return { ok: true, root: input.root, candidates, summary: summarize(candidates, files.length) };
  } catch (error) {
    if (error instanceof NotARepositoryError) {
      return { ok: false, error: 'not-a-repository', message: error.message };
    }
    throw error;
  }
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning to stderr and
 * returns `false`, matching the degrade-with-warning pattern used elsewhere in the skill helpers.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(
      `revise-object-relatives: warning: could not determine entry point: ${describeError(error)}\n`,
    );
    return false;
  }
}

/**
 * Counts a candidate set by file and by shape. A whole-repository sweep can return more candidates than one
 * adjudication pass affords, and these counts are what a caller reads to narrow the next run before paying for it.
 */
function summarize(candidates: readonly Candidate[], filesScanned: number): CandidateSummary {
  const counts = new Map<string, number>();
  // Keyed in the order the rulebook ranks the shapes, so a shape no candidate carries still reads as zero.
  const byShape: Record<SubjectShape, number> = { quantified: 0, definite: 0, bare: 0, pronoun: 0 };

  for (const candidate of candidates) {
    counts.set(candidate.file, (counts.get(candidate.file) ?? 0) + 1);
    byShape[candidate.shape] += 1;
  }

  const byFile: FileCount[] = [...counts]
    .map(([file, count]) => ({ file, count }))
    .toSorted((a, b) => b.count - a.count || a.file.localeCompare(b.file));

  return { total: candidates.length, filesScanned, byFile, byShape };
}

// endregion | Helpers
