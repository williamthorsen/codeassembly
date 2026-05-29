/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';
import { resolveWritableKb } from '../kb-shared/resolve-writable-kb.ts';
import { applyFixes } from './apply.ts';
import { detectFindings } from './detect.ts';
import { enumerateNotes } from './enumerate.ts';
import type { CurateResult, CurateSummary, ParsedArgs } from './types.ts';

/** Default staleness threshold in whole days when `--stale-after` is not supplied. */
const DEFAULT_STALE_AFTER_DAYS = 90;

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runCurate({
      argv: process.argv.slice(2),
      startDir: process.cwd(),
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // The helper's contract is exit 0 with a structured `{ ok: false, ... }` for recoverable failures.
    // System failures (unexpected throws) take the catch arm below.
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-curate: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv. Layout is flag-only: `--kb <name>`, `--apply`, and `--stale-after <days>`. Value-bearing
 * flags accept both `--flag value` and `--flag=value`. `--stale-after` must be a positive integer. An unknown flag,
 * a missing required value, or a non-positive-integer threshold throws with a usage-style message.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let kb: string | null = null;
  let apply = false;
  let staleAfterDays = DEFAULT_STALE_AFTER_DAYS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === '--apply') {
      apply = true;
      continue;
    }

    const kbValue = matchValueFlag(arg, '--kb', argv, index);
    if (kbValue !== null) {
      kb = kbValue.value;
      index += kbValue.consumedNext ? 1 : 0;
      continue;
    }

    const staleValue = matchValueFlag(arg, '--stale-after', argv, index);
    if (staleValue !== null) {
      staleAfterDays = parseStaleAfter(staleValue.value);
      index += staleValue.consumedNext ? 1 : 0;
      continue;
    }

    throw new Error(`unknown flag: ${arg}`);
  }

  return { kb, apply, staleAfterDays };
}

/**
 * Runs the helper end to end: parses args, resolves a single KB, enumerates and parses every note, runs detection
 * across all five categories, and (under `--apply`) performs the two safe fixes before re-reporting residual
 * findings. Recoverable failures (invalid args, no resolvable KB, a readonly KB under `--apply`) become structured
 * `{ ok: false, ... }` results. System failures propagate to `main`'s try/catch.
 *
 * @internal - Exported to allow testing.
 */
export async function runCurate(input: {
  argv: readonly string[];
  startDir: string;
  now: Date;
  home?: string;
}): Promise<CurateResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return { ok: false, error: 'invalid-args', message: error instanceof Error ? error.message : String(error) };
  }

  const mode = args.apply ? 'apply' : 'report';
  const kbOutcome = await resolveKb({
    startDir: input.startDir,
    explicitKb: args.kb,
    requireWritable: args.apply,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!kbOutcome.ok) {
    return kbOutcome.failure;
  }
  const kb = kbOutcome.kb;

  const enumerated = await enumerateNotes(kb.path);
  const findings = await detectFindings({
    kbPath: kb.path,
    notes: enumerated,
    now: input.now,
    staleAfterDays: args.staleAfterDays,
  });

  if (!args.apply) {
    return { ok: true, mode, kb, findings, summary: summarize(findings) };
  }

  const applyOutcome = await applyFixes({ kbPath: kb.path, notes: enumerated, findings });
  const residual = await detectFindings({
    kbPath: kb.path,
    notes: await enumerateNotes(kb.path),
    now: input.now,
    staleAfterDays: args.staleAfterDays,
  });
  return { ok: true, mode, kb, findings: residual, summary: summarize(residual), applied: applyOutcome };
}

// region | Helpers

/** Partitions a finding set into total, error, and warning counts. */
function summarize(findings: readonly { severity: 'error' | 'warning' }[]): CurateSummary {
  let errors = 0;
  let warnings = 0;
  for (const finding of findings) {
    if (finding.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return { total: findings.length, errors, warnings };
}

/**
 * Resolves the KB to curate. Always uses {@link resolveWritableKb}, but tolerates a readonly KB for a read-only
 * report run: `requireWritable` is `false` for report mode, so a `readonly-kb` outcome resolves to the named KB
 * rather than failing. Under `--apply` (`requireWritable: true`), a readonly KB fails with `readonly-kb`.
 */
async function resolveKb(input: {
  startDir: string;
  explicitKb: string | null;
  requireWritable: boolean;
  home?: string;
}): Promise<{ ok: true; kb: ResolvedKb } | { ok: false; failure: CurateResult }> {
  const resolved = await resolveWritableKb({
    startDir: input.startDir,
    explicitKb: input.explicitKb,
    ...(input.home !== undefined && { home: input.home }),
  });

  if (resolved.ok) {
    return { ok: true, kb: resolved.kb };
  }

  if (resolved.reason === 'readonly-kb') {
    if (!input.requireWritable) {
      return { ok: true, kb: { name: resolved.kbName, path: resolved.kbPath, source: 'registry-default' } };
    }
    return {
      ok: false,
      failure: {
        ok: false,
        error: 'readonly-kb',
        message: `knowledge base "${resolved.kbName}" is marked readonly in kb.yaml; --apply is refused`,
      },
    };
  }

  return {
    ok: false,
    failure: {
      ok: false,
      error: 'no-kb-resolvable',
      message:
        resolved.requestedKb === null
          ? 'no .kb/ discovered, no registry default configured, and no --kb supplied'
          : `--kb "${resolved.requestedKb}" does not match any registered knowledge base`,
    },
  };
}

/** Matches a value-bearing flag in either `--flag value` or `--flag=value` form. Returns `null` when `arg` is not it. */
function matchValueFlag(
  arg: string,
  flag: string,
  argv: readonly string[],
  index: number,
): { value: string; consumedNext: boolean } | null {
  if (arg === flag) {
    const next = argv[index + 1] ?? null;
    if (next === null || next.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    return { value: next, consumedNext: true };
  }
  if (arg.startsWith(`${flag}=`)) {
    const value = arg.slice(`${flag}=`.length);
    if (value === '') {
      throw new Error(`${flag} requires a value`);
    }
    return { value, consumedNext: false };
  }
  return null;
}

/** Parses `--stale-after` as a positive integer; throws on a non-integer or non-positive value. */
function parseStaleAfter(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`--stale-after requires a positive integer; got "${value}"`);
  }
  const days = Number.parseInt(value, 10);
  if (days <= 0) {
    throw new Error(`--stale-after requires a positive integer; got "${value}"`);
  }
  return days;
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning to stderr and
 * returns `false`, matching the degrade-with-warning pattern used elsewhere in the kb skills.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-curate: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

// endregion | Helpers
