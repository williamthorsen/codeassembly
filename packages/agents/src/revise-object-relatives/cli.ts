/* eslint n/no-process-exit: off -- CLI entry point: the helper's resolved exit code must reach the OS, and this module runs `main` only behind the `isEntryPoint()` guard, never when imported as a library; throwing-to-set-exitCode would lose the explicit failure-exit contract. */
/* eslint unicorn/no-process-exit: off -- same as above: `process.exit` is the correct termination mechanism at the process boundary, not a library-internal anti-pattern here. */
/**
 * CLI entry for the prose sweep.
 *
 * Two commands. `detect` (the default) sweeps, batches, and reports; `record` folds one run's outcome into the
 * repository's record and is the only path that writes it. Positional arguments narrow the sweep to the files they
 * name or contain; with none, the sweep covers the whole repository.
 *
 * Naming no rule detects the reduced object relative alone and neither reads nor writes the record, which is what
 * holds the pre-rules invocation stable.
 *
 * JSON on stdout is the only output: the human-readable report is the agent's, composed once each candidate has been
 * adjudicated. The helper revises no prose. Repairs land through the agent's own editing tool, which keeps one write
 * path and leaves the harness its file tracking.
 */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { DEFAULT_BATCH_BUDGET, planBatches } from './batch.ts';
import { collectProse, NotARepositoryError } from './collect-prose.ts';
import {
  applyRejections,
  composeRecord,
  isCoveredAt,
  parseRecord,
  parseRunFold,
  RECORD_PATH,
  stringifyRecord,
} from './record.ts';
import { detectRules, isRuleId, RULE_IDS } from './rules.ts';
import type {
  Batch,
  Candidate,
  CandidateSummary,
  DetectResult,
  FileCount,
  ParsedArgs,
  ProseRecord,
  RecordResult,
  RuleId,
  SkipReason,
  SubjectShape,
} from './types.ts';

/** The flags the sweep recognizes. Each of `rule` and `unit` may repeat; the scanner reports them in argv order. */
const FLAG_SPECS: ReadonlyArray<FlagSpec<'batch-budget' | 'rule' | 'unit'>> = [
  { name: 'batch-budget', takesValue: true },
  { name: 'rule', takesValue: true },
  { name: 'unit', takesValue: true },
];

/** What an invocation naming no rule detects, which is what the pre-rules skill still calls. */
const LEGACY_RULES: ReadonlyArray<RuleId> = ['reduced-object-relative'];

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const result =
      argv[0] === 'record'
        ? runRecord({ foldJson: await readStdin(), root: process.cwd() })
        : await runDetect({ argv: stripCommand(argv), root: process.cwd() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // The helper's contract is exit 0 with a structured `{ ok: false, ... }` for recoverable failures.
    // System failures (unexpected throws) take the catch arm below.
  } catch (error) {
    process.stderr.write(`revise-prose: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv: positional paths narrowing the sweep, plus the rules and units the caller holds.
 *
 * `--rule <name>=<unit>` names a rule to detect and the unit owning it; `--unit <name>=<version>` names a unit in
 * force and the version it is at. Both repeat. `--batch-budget <bytes>` overrides the default ceiling.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const scanned = scanFlags(argv, FLAG_SPECS);

  const units = new Map<string, string>();
  const rules: Array<{ rule: RuleId; unit: string }> = [];
  let budget = DEFAULT_BATCH_BUDGET;

  for (const flag of scanned.flags) {
    const value = flag.value ?? '';
    if (flag.name === 'batch-budget') {
      budget = Number(value);
      if (!Number.isInteger(budget) || budget <= 0) {
        throw new Error(`--batch-budget must be a positive integer, got "${value}"`);
      }
      continue;
    }

    const [name, rest] = splitPair(flag.name, value);
    if (flag.name === 'unit') {
      units.set(name, rest);
      continue;
    }
    if (!isRuleId(name)) {
      throw new Error(`unknown rule "${name}"; the helper detects ${RULE_IDS.join(', ')}`);
    }
    rules.push({ rule: name, unit: rest });
  }

  for (const named of rules) {
    if (!units.has(named.unit)) {
      throw new Error(`rule "${named.rule}" names unit "${named.unit}", which no --unit declares`);
    }
  }

  return { paths: scanned.positionals, rules, units, budget };
}

/**
 * Runs a sweep end to end: parses args, collects prose, detects every named rule's candidates, applies the record, and
 * plans the batches left to adjudicate. Invalid args, a root outside a git working tree, and a malformed record all
 * become structured `{ ok: false, ... }` results; anything else propagates to `main`'s try/catch.
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

  let record: ProseRecord;
  try {
    record = readRecordFile(input.root);
  } catch (error) {
    return { ok: false, error: 'invalid-record', message: describeError(error) };
  }

  try {
    const { scannedFiles, skipped, spans } = await collectProse({
      root: input.root,
      paths: args.paths,
      ...(input.home !== undefined && { home: input.home }),
    });

    const rules = args.rules.length === 0 ? LEGACY_RULES : args.rules.map((named) => named.rule);
    const detected = detectRules(spans, rules);
    const candidates = args.units.size === 0 ? detected : applyRejections(detected, record, args.units);

    const planned = planBatches({ files: scannedFiles, candidates, budget: args.budget });
    const batches = planned.filter((batch) => batch.files.some((file) => !isCoveredAt(record, args.units, file)));

    return {
      ok: true,
      root: input.root,
      candidates,
      batches,
      summary: summarize({ candidates, scanned: scannedFiles.length, skipped, batches, planned }),
    };
  } catch (error) {
    if (error instanceof NotARepositoryError) {
      return { ok: false, error: 'not-a-repository', message: error.message };
    }
    throw error;
  }
}

/**
 * Folds one run's outcome into the repository's record and writes it. This is the record's only write path, which is
 * what keeps its YAML deterministic rather than hand-edited into drift.
 *
 * @internal - Exported to allow testing.
 */
export function runRecord(input: { foldJson: string; root: string }): RecordResult {
  let record: ProseRecord;
  try {
    record = composeRecord(readRecordFile(input.root), parseRunFold(input.foldJson));
  } catch (error) {
    return { ok: false, error: 'invalid-record', message: describeError(error) };
  }

  const absolute = path.join(input.root, RECORD_PATH);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, stringifyRecord(record), 'utf8');

  return { ok: true, path: RECORD_PATH, units: Object.keys(record.units).length, rejections: record.rejections.length };
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
    process.stderr.write(`revise-prose: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Reads the repository's record, treating an absent file as the empty record. */
function readRecordFile(root: string): ProseRecord {
  let content: string;
  try {
    content = readFileSync(path.join(root, RECORD_PATH), 'utf8');
  } catch {
    return { units: {}, rejections: [] };
  }
  return parseRecord(content);
}

/** Reads standard input to EOF, which is how the `record` command receives the run's fold. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Splits a `name=value` flag argument. Both halves must be non-empty, an empty unit name or version naming nothing the
 * record could key on.
 */
function splitPair(flag: string, value: string): [string, string] {
  const cut = value.indexOf('=');
  const name = cut === -1 ? '' : value.slice(0, cut);
  const rest = cut === -1 ? '' : value.slice(cut + 1);
  if (name === '' || rest === '') {
    throw new Error(`--${flag} takes <name>=<value>, got "${value}"`);
  }
  return [name, rest];
}

/** Drops a leading `detect` verb, so the command form and the bare path form parse alike. */
function stripCommand(argv: readonly string[]): readonly string[] {
  return argv[0] === 'detect' ? argv.slice(1) : argv;
}

/**
 * Counts a candidate set by file, by rule, and by shape, alongside how many files the sweep read, how many it held
 * out, and how many batches the record let it skip. A whole-repository sweep can return more candidates than one
 * adjudication pass affords, and these counts are what a caller reads to narrow the next run before paying for it.
 * The skip counts keep an exclusion visible: a file never opened by the sweep would otherwise leave the report looking
 * clean.
 */
function summarize(input: {
  candidates: readonly Candidate[];
  scanned: number;
  skipped: Readonly<Record<SkipReason, number>>;
  batches: readonly Batch[];
  planned: readonly Batch[];
}): CandidateSummary {
  const counts = new Map<string, number>();
  // Keyed in the order the rulebook ranks the shapes, so a shape carried by no candidate still reads as zero.
  const byShape: Record<SubjectShape, number> = { quantified: 0, definite: 0, bare: 0, pronoun: 0 };
  const byRule: Record<RuleId, number> = { 'em-dash': 0, 'reduced-object-relative': 0 };

  for (const candidate of input.candidates) {
    counts.set(candidate.file, (counts.get(candidate.file) ?? 0) + 1);
    byRule[candidate.rule] += 1;
    if (candidate.rule === 'reduced-object-relative') byShape[candidate.shape] += 1;
  }

  const byFile: FileCount[] = [...counts]
    .map(([file, count]) => ({ file, count }))
    .toSorted((a, b) => b.count - a.count || a.file.localeCompare(b.file));

  return {
    total: input.candidates.length,
    filesScanned: input.scanned,
    filesSkipped: input.skipped,
    batchesPlanned: input.planned.length,
    batchesSkipped: input.planned.length - input.batches.length,
    stale: input.candidates.filter((candidate) => candidate.stale === true).length,
    byFile,
    byRule,
    byShape,
  };
}

// endregion | Helpers
