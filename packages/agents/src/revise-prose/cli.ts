/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard. */
/* eslint unicorn/no-process-exit: off -- same as above. */
/**
 * CLI entry for the prose sweep.
 *
 * Two commands. `detect` (the default) sweeps, batches, and reports; `record` folds one run's outcome into the
 * repository's record and is the only path that writes it. Positional arguments narrow the sweep to the files that
 * they name or contain; with none, the sweep covers the whole repository.
 *
 * With no unit declared, `detect` runs the reduced-object-relative detector alone and does not read the record, which
 * keeps the pre-rules invocation stable. A rule cannot be named without its unit, so an invocation naming no rule
 * declares no unit unless it names one on its own. Coverage and rejections are keyed on each rule's sweep version; a
 * unit's version is read only to convert a record written before rules were versioned.
 *
 * JSON on stdout is the only output: The human-readable report is the agent's, composed once each candidate has been
 * adjudicated. The helper revises no prose. The agent applies repairs with its own editing tool, which keeps one write
 * path and leaves the harness its file tracking.
 */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { DEFAULT_BATCH_BUDGET, planBatches } from './batch.ts';
import { collectProse, extractFileProse, NotARepositoryError } from './collect-prose.ts';
import {
  applyRejections,
  composeRecord,
  containsPhrase,
  listUnsweptRules,
  parseRecord,
  parseRunFold,
  RECORD_PATH,
  RULE_NAME_PATTERN,
  selectPriorRejections,
  stringifyRecord,
  SWEEP_VERSION_PATTERN,
} from './record.ts';
import { detectRules, isRuleId } from './rules.ts';
import type {
  Batch,
  Candidate,
  CandidateSummary,
  DetectResult,
  FileCount,
  NamedRule,
  ParsedArgs,
  ProseRecord,
  RecordedRejection,
  RecordResult,
  ReportedBatch,
  RuleId,
  RunFold,
  SiteText,
  SkipReason,
  SubjectShape,
  SweepVersions,
  VersionedRule,
} from './types.ts';

/** The flags recognized by the sweep. Each of `rule` and `unit` may repeat; the scanner reports them in argv order. */
const FLAG_SPECS: ReadonlyArray<FlagSpec<'batch-budget' | 'rule' | 'unit'>> = [
  { name: 'batch-budget', takesValue: true },
  { name: 'rule', takesValue: true },
  { name: 'unit', takesValue: true },
];

/** What an invocation declaring no unit reads in place of the repository's record. */
const EMPTY_RECORD: ProseRecord = { rules: {}, rejections: [] };

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
  } catch (error) {
    process.stderr.write(`revise-prose: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv: positional paths narrowing the sweep, plus the rules and units that the caller holds.
 *
 * `--rule <name>@<version>=<unit>` names a rule, its sweep version, and the unit owning it, whether or not the helper
 * has a detector for it; `--rule <name>=<unit>` names a rule that declares no sweep version, which is swept but never
 * recorded. `--unit <name>=<version>` names a unit in force and the version it is at. Both repeat.
 * `--batch-budget <bytes>` overrides the default ceiling.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const scanned = scanFlags(argv, FLAG_SPECS);

  const units = new Map<string, string>();
  const rules: NamedRule[] = [];
  let budget = DEFAULT_BATCH_BUDGET;

  for (const flag of scanned.flags) {
    const value = flag.value ?? '';
    if (flag.name === 'batch-budget') {
      budget = Number(value);
      if (!Number.isSafeInteger(budget) || budget <= 0) {
        throw new Error(`--batch-budget must be a positive integer, got "${value}"`);
      }
      continue;
    }

    const [name, rest] = splitPair(flag.name, value);
    if (flag.name === 'unit') {
      units.set(name, rest);
      continue;
    }
    const [rule, version] = splitVersion(name);
    if (!RULE_NAME_PATTERN.test(rule)) {
      throw new Error(`rule "${rule}" is not a lowercase kebab-case name`);
    }
    if (version !== undefined && !SWEEP_VERSION_PATTERN.test(version)) {
      throw new Error(`rule "${rule}" names sweep version "${version}", which is not a positive integer`);
    }
    const owner = rules.find((named) => named.rule === rule);
    if (owner !== undefined) {
      throw new Error(`rule "${rule}" is named twice, under units "${owner.unit}" and "${rest}"; a rule has one unit`);
    }
    rules.push({ rule, unit: rest, version });
  }

  for (const named of rules) {
    if (!units.has(named.unit)) {
      throw new Error(`rule "${named.rule}" names unit "${named.unit}", which no --unit declares`);
    }
  }

  return { paths: scanned.positionals, rules, units, budget };
}

/**
 * Runs a sweep end to end: parses args, collects prose, detects every named rule's candidates, applies the record,
 * plans the batches left to adjudicate with the versioned rules that each one's files still need, and narrows the
 * candidates and rejections to what those batches apply. A run that versions no rule reports every batch. Invalid
 * args, a root outside a git working tree, and a malformed record all become structured `{ ok: false, ... }` results;
 * anything else propagates to `main`'s try/catch.
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

  const versions = buildArgVersions(args);
  const ruleVersions = selectRuleVersions(versions);

  // Read only when a unit is declared: With none, no version exists to compare coverage or a rejection against, and
  // a malformed record would otherwise fail an invocation that never consults it.
  let record: ProseRecord = EMPTY_RECORD;
  if (args.units.size > 0) {
    try {
      record = readRecordFile(input.root, versions);
    } catch (error) {
      return { ok: false, error: 'invalid-record', message: describeError(error) };
    }
  }

  try {
    const { scannedFiles, skipped, spans } = await collectProse({
      root: input.root,
      paths: args.paths,
      ...(input.home !== undefined && { home: input.home }),
    });

    const rules = args.rules.length === 0 ? LEGACY_RULES : selectDetectorRules(args.rules);
    const detected = detectRules(spans, rules);
    const applied = args.units.size === 0 ? detected : applyRejections(detected, record, ruleVersions);

    // Plan from every candidate: A recurring sentence links its files before coverage decides which rules they need.
    const planned = planBatches({ files: scannedFiles, candidates: applied, budget: args.budget });
    const batches: ReportedBatch[] = planned
      .map((batch) => ({ ...batch, unswept: listBatchUnsweptRules(record, ruleVersions, batch.files) }))
      .filter((batch) => ruleVersions.size === 0 || batch.unswept.length > 0);

    const isInScope = buildBatchScope(batches, ruleVersions);
    const candidates = applied.filter((candidate) => isInScope(candidate));
    const rejections = selectPriorRejections(
      record,
      ruleVersions,
      scannedFiles.map((scanned) => scanned.file),
    ).filter((rejection) => isInScope(rejection));

    return {
      ok: true,
      root: input.root,
      candidates,
      rejections,
      batches,
      rules: {
        detected: rules.toSorted(),
        undetected: args.rules
          .map((named) => named.rule)
          .filter((rule) => !isRuleId(rule))
          .toSorted(),
      },
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
 * Folds one run's outcome into the repository's record and writes it. A rule's coverage records whether the helper has
 * its detector, which is what lets a detector added later run over files already covered. A prior rejection's site is
 * looked for in its file as the file stands when the command runs.
 *
 * @internal - Exported to allow testing.
 */
export function runRecord(input: { foldJson: string; root: string }): RecordResult {
  let record: ProseRecord;
  try {
    const fold = parseRunFold(input.foldJson);
    record = composeRecord(
      readRecordFile(input.root, buildFoldVersions(fold)),
      fold,
      buildSitePredicate(input.root),
      isRuleId,
    );
  } catch (error) {
    return { ok: false, error: 'invalid-record', message: describeError(error) };
  }

  const absolute = path.join(input.root, RECORD_PATH);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, stringifyRecord(record), 'utf8');

  return { ok: true, path: RECORD_PATH, rules: Object.keys(record.rules).length, rejections: record.rejections.length };
}

// region | Helpers

/** Builds the versions that an invocation holds, keeping only the named rules that declare a sweep version. */
function buildArgVersions(args: ParsedArgs): SweepVersions {
  const rules = new Map<string, VersionedRule>();
  for (const { rule, unit, version } of args.rules) {
    if (version !== undefined) rules.set(rule, { unit, version });
  }
  return { units: args.units, rules };
}

/**
 * Builds the predicate that decides whether a site belongs to a reported batch: Its file is in one, and that batch
 * applies its rule, which is either unswept there or not versioned by the run.
 */
function buildBatchScope(
  batches: readonly ReportedBatch[],
  ruleVersions: ReadonlyMap<string, string>,
): (site: { file: string; rule: string }) => boolean {
  const unsweptByFile = new Map<string, ReadonlySet<string>>();
  for (const batch of batches) {
    const unswept = new Set(batch.unswept);
    for (const file of batch.files) unsweptByFile.set(file, unswept);
  }

  return (site) => {
    const unswept = unsweptByFile.get(site.file);
    return unswept !== undefined && (unswept.has(site.rule) || !ruleVersions.has(site.rule));
  };
}

/** Builds the versions that a fold holds. */
function buildFoldVersions(fold: RunFold): SweepVersions {
  return { units: new Map(Object.entries(fold.units)), rules: new Map(Object.entries(fold.rules)) };
}

/**
 * Builds the predicate with which `record` decides whether a rejection's site still exists, reading each file at most
 * once. The predicate finds no site in a file that it cannot read.
 */
function buildSitePredicate(root: string): (rejection: RecordedRejection) => boolean {
  const texts = new Map<string, SiteText | undefined>();

  return (rejection) => {
    if (!texts.has(rejection.file)) texts.set(rejection.file, readSiteText(root, rejection.file));
    const text = texts.get(rejection.file);
    return text !== undefined && containsPhrase(text, rejection.phrase);
  };
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning to stderr and
 * returns `false`.
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

/** Lists, sorted, the versioned rules for which the record does not cover at least one of `files`. */
function listBatchUnsweptRules(
  record: ProseRecord,
  ruleVersions: ReadonlyMap<string, string>,
  files: readonly string[],
): string[] {
  const unswept = new Set(files.flatMap((file) => listUnsweptRules(record, ruleVersions, isRuleId, file)));
  return [...unswept].toSorted();
}

/** Reads the repository's record, treating an absent file as the empty record and converting a legacy one. */
function readRecordFile(root: string, versions: SweepVersions): ProseRecord {
  let content: string;
  try {
    content = readFileSync(path.join(root, RECORD_PATH), 'utf8');
  } catch {
    return { rules: {}, rejections: [] };
  }
  return parseRecord(content, versions);
}

/** Reads one repository file's content and extracted prose, or returns undefined if the file cannot be read. */
function readSiteText(root: string, file: string): SiteText | undefined {
  let content: string;
  try {
    content = readFileSync(path.join(root, file), 'utf8');
  } catch {
    return undefined;
  }

  const prose = extractFileProse({ file, content })
    .map((span) => span.text)
    .join('\n');
  return { prose, content };
}

/** Reads standard input to EOF, which is how the `record` command receives the run's fold. */
async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  // The stream yields `any`, so each chunk is narrowed rather than asserted: A string arrives when an encoding is set.
  for await (const chunk of process.stdin) {
    chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk), 'utf8'));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Returns the named rules for which the helper has a detector. */
function selectDetectorRules(rules: readonly NamedRule[]): RuleId[] {
  return rules.map((named) => named.rule).filter(isRuleId);
}

/** Returns each versioned rule's sweep version, by rule. */
function selectRuleVersions(versions: SweepVersions): ReadonlyMap<string, string> {
  return new Map(versions.rules.entries().map(([rule, { version }]) => [rule, version]));
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

/** Splits a rule flag's name into the rule and the sweep version after its first `@`, if it names one. */
function splitVersion(name: string): [string, string | undefined] {
  const cut = name.indexOf('@');
  return cut === -1 ? [name, undefined] : [name.slice(0, cut), name.slice(cut + 1)];
}

/** Drops a leading `detect` verb, so the command form and the bare path form parse alike. */
function stripCommand(argv: readonly string[]): readonly string[] {
  return argv[0] === 'detect' ? argv.slice(1) : argv;
}

/**
 * Counts a candidate set by file, by rule, and by shape, alongside how many files the sweep read, how many it
 * excluded, and how many batches the record let it skip. A whole-repository sweep can return more candidates than one
 * adjudication pass affords, and these counts are what a caller reads to narrow the next run before paying for it.
 * The skip counts keep an exclusion visible: A file never opened by the sweep would otherwise leave the report looking
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
  // Keyed in the order the rulebook ranks the shapes.
  const byShape: Record<SubjectShape, number> = { quantified: 0, definite: 0, bare: 0, pronoun: 0 };
  const byRule: Record<RuleId, number> = {
    'em-dash': 0,
    'reduced-object-relative': 0,
    'second-person': 0,
    so: 0,
    where: 0,
  };

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
