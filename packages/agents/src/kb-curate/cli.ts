/* eslint n/no-process-exit: off -- CLI entry point: the helper's resolved exit code must reach the OS, and this module runs `main` only behind the `isEntryPoint()` guard, never when imported as a library; throwing-to-set-exitCode would lose the explicit failure-exit contract. */
/* eslint unicorn/no-process-exit: off -- same as above: `process.exit` is the correct termination mechanism at the process boundary, not a library-internal anti-pattern here. */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { Finding } from '@williamthorsen/kb';
import type { EnumeratedNote } from '@williamthorsen/kb/check';
import { check } from '@williamthorsen/kb/check';
import { isKbLoaderError } from '@williamthorsen/kb/config';
import { describeError } from '@williamthorsen/toolbelt.errors/candidate';

import { formatMissingDestinationMessage } from '../kb-shared/format-missing-destination.ts';
import type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';
import { resolveWritableKb } from '../kb-shared/resolve-writable-kb.ts';
import { applyFixes } from './apply.ts';
import { detectCurateFindings, sortFindings } from './detect.ts';
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
    const message = describeError(error);
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
 * across all six categories, and (under `--apply`) performs the two safe fixes before re-reporting residual
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
    return { ok: false, error: 'invalid-args', message: describeError(error) };
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

  const checkInput = { kbRoot: kb.path, now: input.now, staleAfterDays: args.staleAfterDays };

  const checked = await guardedCurateCheck(checkInput);
  if (!checked.ok) {
    return checked.failure;
  }

  if (!args.apply) {
    return { ok: true, mode, kb, findings: checked.value.findings, summary: summarize(checked.value.findings) };
  }

  const applyOutcome = await applyFixes({
    kbPath: kb.path,
    notes: checked.value.notes,
    findings: checked.value.findings,
  });
  const residual = await guardedCurateCheck(checkInput);
  if (!residual.ok) {
    return residual.failure;
  }
  return {
    ok: true,
    mode,
    kb,
    findings: residual.value.findings,
    summary: summarize(residual.value.findings),
    applied: applyOutcome,
  };
}

// region | Helpers

/** A guarded `curateCheck` outcome: the check result, or an `invalid-config` failure mapped from a loader defect. */
type GuardedCheck =
  { ok: true; value: { notes: readonly EnumeratedNote[]; findings: Finding[] } } | { ok: false; failure: CurateResult };

/**
 * Runs {@link curateCheck} and maps a `KbLoaderError` (malformed config, aliases, or taxonomy) to a structured
 * `invalid-config` failure. Any other throw — an enumeration or detection crash — propagates as a real failure rather
 * than being relabeled as a config error. Both `runCurate` check calls route through here so the guard cannot drift.
 */
async function guardedCurateCheck(input: { kbRoot: string; now: Date; staleAfterDays: number }): Promise<GuardedCheck> {
  try {
    return { ok: true, value: await curateCheck(input) };
  } catch (error) {
    if (isKbLoaderError(error)) {
      return { ok: false, failure: { ok: false, error: 'invalid-config', message: error.message } };
    }
    throw error;
  }
}

/**
 * Runs the shared `check` for a KB and layers curate's own detectors over the same enumeration: the
 * link/basename/tag-alias/paths findings come from `check`, and verification-staleness plus supersede-graph findings
 * are detected here. The combined set is sorted by path, then line, then rule. A loader defect propagates as a
 * `KbLoaderError` for the caller to map to `invalid-config`.
 */
async function curateCheck(input: {
  kbRoot: string;
  now: Date;
  staleAfterDays: number;
}): Promise<{ notes: readonly EnumeratedNote[]; findings: Finding[] }> {
  const { notes, findings: base } = await check({ kbRoot: input.kbRoot });
  const curateFindings = detectCurateFindings({ notes, now: input.now, staleAfterDays: input.staleAfterDays });
  return { notes, findings: sortFindings([...base, ...curateFindings]) };
}

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
 * Resolves the KB to curate and maps a resolution failure to a structured `CurateResult`. A report run passes
 * `requireWritable: false`, so a store the registry marks `readonly: true` is reported on; `--apply` requires a
 * writable one and fails with `readonly-kb`.
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
    requireWritable: input.requireWritable,
    ...(input.home !== undefined && { home: input.home }),
  });

  if (resolved.ok) {
    return { ok: true, kb: resolved.kb };
  }

  switch (resolved.reason) {
    case 'no-kb-resolvable':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'no-kb-resolvable',
          message: `--kb "${resolved.requestedKb}" does not match any registered knowledge base`,
        },
      };
    case 'missing-destination':
      return {
        ok: false,
        failure: { ok: false, error: 'no-kb-resolvable', message: formatMissingDestinationMessage(resolved) },
      };
    case 'no-default':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'no-kb-resolvable',
          message:
            resolved.registryError !== undefined
              ? `could not resolve the default knowledge base: ${resolved.registryError}`
              : '--kb @default was given but no default_kb is configured in kb.yaml',
        },
      };
    case 'readonly-kb':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'readonly-kb',
          message: `knowledge base "${resolved.kbName}" is marked readonly in kb.yaml; --apply is refused`,
        },
      };
    default: {
      const _exhaustive: never = resolved;
      throw new Error(`unhandled resolveWritableKb failure: ${JSON.stringify(_exhaustive)}`);
    }
  }
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
    const message = describeError(error);
    process.stderr.write(`kb-curate: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

// endregion | Helpers
