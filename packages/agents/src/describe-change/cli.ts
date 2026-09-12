/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { compileTemplate } from '../change-grammar/compile-template.ts';
import { parse } from '../change-grammar/parse.ts';
import { render } from '../change-grammar/render.ts';
import { BREAKING_MARKER } from '../change-grammar/tokens.ts';
import type { ChangeRecord, Taxonomy } from '../change-grammar/types.ts';
import { verify } from '../change-grammar/verify.ts';
import { type FlagSpec, type MatchedFlag, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { loadTaxonomy } from '../lib/work-types.ts';
import { readChangeRecordBlock, type RecordOverrides, renderChangeRecordBlock } from './change-record-block.ts';
import { classifyCommits } from './classify.ts';
import { loadPreferences, resolveProjectRoot } from './load-preferences.ts';
import { MissingCommitError, readCommits } from './read-commits.ts';
import { readLabelMap, resolveLabeledHead } from './read-label-map.ts';
import { type MergeInput, type MergeOverrides, type MergeReport, resolveMerge } from './resolve-merge.ts';
import { resolveTicketType } from './resolve-ticket-type.ts';
import {
  type ClassifyOutcome,
  isSurface,
  type ParsedArgs,
  type ParseOutcome,
  type RecordBlockOutcome,
  type RenderedTitles,
  type ResolveMergeArgs,
  type Surface,
  SURFACES,
} from './types.ts';

/** The flags this helper accepts; it reads nothing from stdin. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'breaking', takesValue: false },
  { name: 'classify', takesValue: true },
  { name: 'head', takesValue: true },
  { name: 'no-override-breaking', takesValue: false },
  { name: 'override-breaking', takesValue: false },
  { name: 'override-scope', takesValue: true },
  { name: 'override-title', takesValue: true },
  { name: 'override-type', takesValue: true },
  { name: 'parse', takesValue: true },
  { name: 'pr-body-file', takesValue: true },
  { name: 'pr-label', takesValue: true },
  { name: 'pr-number', takesValue: true },
  { name: 'pr-title', takesValue: true },
  { name: 'record-block', takesValue: true },
  { name: 'resolve-merge', takesValue: true },
  { name: 'scope', takesValue: true },
  { name: 'ticket-label', takesValue: true },
  { name: 'ticket-ref', takesValue: true },
  { name: 'title', takesValue: true },
  { name: 'type', takesValue: true },
];

/** The flags that each select a mode other than rendering, so no two of them may appear together. */
const MODE_FLAGS: readonly string[] = ['classify', 'parse', 'record-block', 'resolve-merge'];

/** The flags that set an override, which a `change-record` block records and a merge applies. */
const OVERRIDE_FLAGS: ReadonlySet<string> = new Set(['override-breaking', 'override-scope', 'override-type']);

/** The name this helper reports itself under on stderr. */
const PROGRAM = 'describe-change';

/** The flags `--record-block` accepts: the mode itself, the head's record flags, and the overrides. */
const RECORD_BLOCK_FLAGS: ReadonlySet<string> = new Set([
  'breaking',
  'record-block',
  'scope',
  'title',
  'type',
  ...OVERRIDE_FLAGS,
]);

/** The flags `--resolve-merge` accepts: the mode itself, the pull request's inputs, and the author's overrides. */
const RESOLVE_MERGE_FLAGS: ReadonlySet<string> = new Set([
  'head',
  'no-override-breaking',
  'override-title',
  'pr-body-file',
  'pr-label',
  'pr-number',
  'pr-title',
  'resolve-merge',
  'ticket-ref',
  ...OVERRIDE_FLAGS,
]);

/** The flags that carry a pull request's inputs to `--resolve-merge` and mean nothing in any other mode. */
const RESOLVE_MERGE_ONLY_FLAGS: ReadonlySet<string> = new Set([
  'head',
  'no-override-breaking',
  'override-title',
  'pr-body-file',
  'pr-label',
  'pr-title',
]);

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const { output, warnings } = await runDescribe({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      dataDir: resolveDefaultDataDir(),
      home: homedir(),
    });
    for (const warning of warnings) {
      process.stderr.write(`${PROGRAM}: ${warning}\n`);
    }
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(`${PROGRAM}: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv into what the run asks for.
 *
 * Every record flag is optional, and a flag left off resolves its token to empty, so an invocation carrying no flags
 * renders each template against an empty record. `--type feat!` is accepted and split into the bare type and the
 * breaking flag, which `--breaking` sets directly.
 *
 * `--parse` names the surface whose template reads the subject, and the subject itself follows as the one positional.
 * It takes no record flags: a record flag alongside it would be silently unused.
 *
 * `--classify` names the base ref of the range to read, and takes `--ticket-label` as often as the ticket carries one.
 * It takes no record flags either.
 *
 * `--record-block` names the commit from which the head was derived, reads the head from `--title`, `--scope`,
 * `--type`, and `--breaking`, and reads the author's overrides from `--override-scope`, `--override-type`, and
 * `--override-breaking`.
 *
 * `--resolve-merge` names the base ref of a pull request's range and reads the pull request from `--head`, `--pr-title`,
 * `--pr-body-file`, `--pr-number`, every `--pr-label`, and `--ticket-ref`. It takes no record flags, since the head comes
 * from the pull request, and reads the author's overrides from `--override-scope`, `--override-type`,
 * `--override-breaking` or `--no-override-breaking`, and `--override-title`. The override flags mean nothing in
 * rendering mode, and the four non-rendering modes are mutually exclusive.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals, flags } = scanFlags(argv, FLAGS);
  const values = valueFlagMap(flags);

  const modes = MODE_FLAGS.filter((name) => values[name] !== undefined);
  if (modes.length > 1) {
    throw new Error(`${modes.map((name) => `--${name}`).join(' and ')} each select a mode; pass one`);
  }
  if (values.classify !== undefined) {
    return parseClassifyArgs(values.classify, positionals, flags);
  }
  if (values.parse !== undefined) {
    return parseReadArgs(values.parse, positionals, flags);
  }
  if (values['record-block'] !== undefined) {
    return parseRecordBlockArgs(values['record-block'], positionals, flags);
  }
  if (values['resolve-merge'] !== undefined) {
    return parseResolveMergeArgs(values['resolve-merge'], positionals, flags);
  }
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
  if (values['ticket-label'] !== undefined) {
    throw new Error('--ticket-label resolves a ticket type for --classify, so it takes no meaning on its own');
  }
  const mergeInput = flags.find((flag) => RESOLVE_MERGE_ONLY_FLAGS.has(flag.name));
  if (mergeInput !== undefined) {
    throw new Error(`--${mergeInput.name} is an input to --resolve-merge, so it takes no meaning on its own`);
  }
  const override = flags.find((flag) => OVERRIDE_FLAGS.has(flag.name));
  if (override !== undefined) {
    throw new Error(
      `--${override.name} sets an override for --record-block or --resolve-merge, so it takes no meaning on its own`,
    );
  }

  return { mode: 'render', record: readRecordFlags(flags) };
}

/**
 * Runs the helper end to end: parses args, resolves the templates from the project and global preferences files,
 * refuses any template the engine cannot round-trip, and then renders titles, reads a subject, classifies a commit
 * range, renders a `change-record` block, or resolves a merge.
 *
 * A run outside a repository warns and anchors the project lookup at `cwd` rather than failing, since a title still
 * renders from the global templates. An unreadable taxonomy likewise warns: rendering needs none, so only the
 * verification pass and `--parse` are lost.
 *
 * @internal - Exported to allow testing.
 */
export async function runDescribe(input: {
  argv: readonly string[];
  cwd: string;
  dataDir: string;
  home: string;
}): Promise<DescribeResult> {
  const args = parseArgs(input.argv);

  const { projectRoot, warning } = await resolveProjectRoot(input.cwd);
  const { templates, warnings } = await loadPreferences({ home: input.home, projectRoot });
  if (warning !== undefined) {
    warnings.unshift(warning);
  }

  const taxonomy = await loadTaxonomy(input.dataDir);
  if (taxonomy === null) {
    warnings.push(`no readable work-types.json under ${input.dataDir}; templates are not verified`);
  } else {
    refuseUnverifiableTemplates(templates, taxonomy);
  }

  if (args.mode === 'parse') {
    if (taxonomy === null) {
      throw new Error(`--parse resolves the type against the taxonomy; none is readable under ${input.dataDir}`);
    }
    return { output: readSubject(args.surface, templates[args.surface], args.subject, taxonomy), warnings };
  }

  if (args.mode === 'classify') {
    if (taxonomy === null) {
      throw new Error(`--classify ranks types against the taxonomy; none is readable under ${input.dataDir}`);
    }
    if (templates.commit === '') {
      throw new Error('commit.title_format is empty, so a branch’s commits cannot be read back');
    }
    const output = await classifyRange({
      baseRef: args.baseRef,
      cwd: projectRoot,
      taxonomy,
      template: templates.commit,
      ticketLabels: args.ticketLabels,
    });
    return { output, warnings };
  }

  if (args.mode === 'record-block') {
    return { output: { block: renderChangeRecordBlock(args.block) }, warnings };
  }

  if (args.mode === 'resolve-merge') {
    if (taxonomy === null) {
      throw new Error(`--resolve-merge checks types against the taxonomy; none is readable under ${input.dataDir}`);
    }
    const output = await resolveMergeRun({ args: args.merge, cwd: input.cwd, projectRoot, taxonomy, templates });
    return { output, warnings };
  }

  return {
    output: {
      commit_title: renderTemplate(templates.commit, args.record),
      ticket_title: renderTemplate(templates.ticket, args.record),
      pr_title: renderTemplate(templates.pr, args.record),
      merge_title: renderTemplate(templates.merge, args.record),
    },
    warnings,
  };
}

/** What a completed run writes: the JSON payload for stdout, and the diagnostics for stderr. */
export interface DescribeResult {
  output: ClassifyOutcome | MergeReport | ParseOutcome | RecordBlockOutcome | RenderedTitles;
  warnings: string[];
}

// region | Helpers

/**
 * Reads a range's commits, classifies them, and resolves the ticket type, in the shape the JSON output names. Each entry
 * is rendered back through the template that read it, so its `change` is canonical whatever the subject it came from.
 */
async function classifyRange(input: {
  baseRef: string;
  cwd: string;
  taxonomy: Taxonomy;
  template: string;
  ticketLabels: readonly string[];
}): Promise<ClassifyOutcome> {
  const commits = await readCommits({ baseRef: input.baseRef, cwd: input.cwd });
  const nodes = compileTemplate(input.template);
  const classification = classifyCommits(commits, nodes, input.taxonomy);
  const ticketType = await resolveTicketType({
    labelMapPath: path.join(input.cwd, '.meta', 'label-map.json'),
    labels: input.ticketLabels,
  });

  return {
    entries: classification.entries.map((entry) => ({
      breaking: entry.record.breaking === true,
      change: render(nodes, entry.record),
      commit: entry.commit,
      scope: entry.record.scope ?? null,
      title: entry.record.title ?? null,
      type: entry.record.type ?? null,
    })),
    head:
      classification.head === undefined
        ? null
        : {
            breaking: classification.head.breaking === true,
            scope: classification.head.scope ?? null,
            type: classification.head.type ?? null,
          },
    ticket_type: ticketType ?? null,
    unclassified: classification.unclassified,
    violations: classification.violations,
  };
}

/**
 * Derives the head that a pull request's commits consolidate to, reading the range to its head commit. A head commit
 * absent from the local repository, and an empty `commit.title_format`, leave the derivation unavailable with the reason
 * named, so the merge still resolves; any other git failure propagates.
 */
async function deriveMergeHead(input: {
  args: ResolveMergeArgs;
  cwd: string;
  taxonomy: Taxonomy;
  template: string;
}): Promise<MergeInput['derivation']> {
  if (input.template === '') {
    return {
      kind: 'unavailable',
      reason: 'commit.title_format is empty, so no commit and no title prefix can be read through it',
    };
  }
  try {
    const commits = await readCommits({ baseRef: input.args.baseRef, cwd: input.cwd, headRef: input.args.headCommit });
    const { head } = classifyCommits(commits, compileTemplate(input.template), input.taxonomy);
    return { head: head ?? {}, kind: 'derived' };
  } catch (error) {
    if (error instanceof MissingCommitError) {
      return { kind: 'unavailable', reason: `the head commit ${error.ref} is not in the local repository` };
    }
    throw error;
  }
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning and returns
 * `false`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(`${PROGRAM}: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Reads the `--classify` invocation: the base ref it names, and every `--ticket-label` the ticket carries. */
function parseClassifyArgs(baseRef: string, positionals: readonly string[], flags: readonly MatchedFlag[]): ParsedArgs {
  const other = flags.find((flag) => flag.name !== 'classify' && flag.name !== 'ticket-label');
  if (other !== undefined) {
    throw new Error(`--classify reads a commit range, so it takes no record flags; got --${other.name}`);
  }
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }

  const ticketLabels: string[] = [];
  for (const flag of flags) {
    if (flag.name === 'ticket-label' && flag.value !== null) {
      ticketLabels.push(flag.value);
    }
  }
  return { baseRef, mode: 'classify', ticketLabels };
}

/** Reads the `--parse` invocation: the surface it names, and the single positional carrying the subject. */
function parseReadArgs(surface: string, positionals: readonly string[], flags: readonly MatchedFlag[]): ParsedArgs {
  if (!isSurface(surface)) {
    throw new Error(`--parse must name one of ${SURFACES.join(', ')}`);
  }
  const other = flags.find((flag) => flag.name !== 'parse');
  if (other !== undefined) {
    throw new Error(`--parse reads a rendered subject, so it takes no record flags; got --${other.name}`);
  }
  const [subject, extra] = positionals;
  if (subject === undefined) {
    throw new Error('--parse takes the surface and the subject string to read');
  }
  if (extra !== undefined) {
    throw new Error(`unexpected argument: ${extra}`);
  }
  return { mode: 'parse', subject, surface };
}

/** Reads the `--record-block` invocation: the commit it names, the head's record flags, and the author's overrides. */
function parseRecordBlockArgs(
  commit: string,
  positionals: readonly string[],
  flags: readonly MatchedFlag[],
): ParsedArgs {
  const other = flags.find((flag) => !RECORD_BLOCK_FLAGS.has(flag.name));
  if (other !== undefined) {
    throw new Error(`--record-block records a head and its overrides, so it takes no --${other.name}`);
  }
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
  if (commit.trim() === '') {
    throw new Error('--record-block takes the commit from which the head was derived');
  }

  const values = valueFlagMap(flags);
  const overrides: RecordOverrides = {
    ...(flags.some((flag) => flag.name === 'override-breaking') && { breaking: true }),
    ...(values['override-scope'] !== undefined && { scope: values['override-scope'] }),
    ...(values['override-type'] !== undefined && { type: values['override-type'] }),
  };
  return { block: { commit: commit.trim(), head: readRecordFlags(flags), overrides }, mode: 'record-block' };
}

/**
 * Reads the `--resolve-merge` invocation: the base ref it names, the pull request's inputs, and the author's overrides.
 * A type override takes a bare type, since `--override-breaking` and `--no-override-breaking` set the marker.
 */
function parseResolveMergeArgs(
  baseRef: string,
  positionals: readonly string[],
  flags: readonly MatchedFlag[],
): ParsedArgs {
  const other = flags.find((flag) => !RESOLVE_MERGE_FLAGS.has(flag.name));
  if (other !== undefined) {
    throw new Error(`--resolve-merge reads the head from the pull request, so it takes no --${other.name}`);
  }
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
  if (baseRef.trim() === '') {
    throw new Error('--resolve-merge takes the base ref of the pull request’s range');
  }

  const values = valueFlagMap(flags);
  const prNumber = readRequiredValue(values, 'pr-number');
  if (!/^\d+$/.test(prNumber)) {
    throw new Error(`--pr-number takes the pull request’s number; got ${prNumber}`);
  }
  const breakingFlags = new Set(
    flags.filter((flag) => flag.name.endsWith('override-breaking')).map((flag) => flag.name),
  );
  if (breakingFlags.size > 1) {
    throw new Error('--override-breaking and --no-override-breaking set the marker in opposite directions; pass one');
  }
  for (const name of ['override-scope', 'override-title', 'override-type', 'ticket-ref']) {
    if (values[name]?.trim() === '') {
      throw new Error(`--${name} requires a value`);
    }
  }
  const type = values['override-type']?.trim();
  if (type?.endsWith(BREAKING_MARKER) === true) {
    throw new Error('--override-type takes a bare type; pass --override-breaking for a breaking change');
  }

  const [breakingFlag] = breakingFlags;
  const scope = values['override-scope']?.trim();
  const title = values['override-title']?.trim();
  const ticketRef = values['ticket-ref']?.trim();
  const overrides: MergeOverrides = {
    ...(breakingFlag !== undefined && { breaking: breakingFlag === 'override-breaking' }),
    ...(scope !== undefined && { scope }),
    ...(title !== undefined && { title }),
    ...(type !== undefined && { type }),
  };
  const merge: ResolveMergeArgs = {
    baseRef: baseRef.trim(),
    headCommit: readRequiredValue(values, 'head'),
    overrides,
    prBodyFile: readRequiredValue(values, 'pr-body-file'),
    prLabels: flags.flatMap((flag) => (flag.name === 'pr-label' && flag.value !== null ? [flag.value] : [])),
    prNumber,
    prTitle: readRequiredValue(values, 'pr-title'),
    ...(ticketRef !== undefined && { ticketRef }),
  };
  return { merge, mode: 'resolve-merge' };
}

/** Reads the record flags into a record, leaving out every field whose flag is absent. */
function readRecordFlags(flags: readonly MatchedFlag[]): ChangeRecord {
  const values = valueFlagMap(flags);
  return {
    ...(flags.some((flag) => flag.name === 'breaking') && { breaking: true }),
    ...(values['pr-number'] !== undefined && { prNumber: values['pr-number'] }),
    ...(values.scope !== undefined && { scope: values.scope }),
    ...(values['ticket-ref'] !== undefined && { ticketRef: values['ticket-ref'] }),
    ...(values.title !== undefined && { title: values.title }),
    ...(values.type !== undefined && { type: values.type }),
  };
}

/** Reads a value flag that the invocation requires, refusing one that is absent or blank. */
function readRequiredValue(values: Record<string, string>, name: string): string {
  const value = values[name]?.trim();
  if (value === undefined || value === '') {
    throw new Error(`--resolve-merge requires --${name}`);
  }
  return value;
}

/** Reads a subject back through one surface's template, reporting each field the record carries. */
function readSubject(surface: Surface, template: string, subject: string, taxonomy: Taxonomy): ParseOutcome {
  if (template === '') {
    throw new Error(`${surface}.title_format is empty, so a ${surface} subject cannot be read back`);
  }
  const record = parse(compileTemplate(template), subject, taxonomy);
  if (record === undefined) {
    return { matched: false };
  }
  return {
    breaking: record.breaking === true,
    matched: true,
    pr_number: record.prNumber ?? null,
    scope: record.scope ?? null,
    ticket_ref: record.ticketRef ?? null,
    title: record.title ?? null,
    type: record.type ?? null,
  };
}

/** Refuses every configured template the engine cannot round-trip, naming the surface, the template, and the defect. */
function refuseUnverifiableTemplates(templates: Record<Surface, string>, taxonomy: Taxonomy): void {
  const defects: string[] = [];
  for (const surface of SURFACES) {
    const template = templates[surface];
    if (template !== '') {
      defects.push(...verify(template, taxonomy).map((defect) => `${surface}.title_format: ${defect}`));
    }
  }
  if (defects.length > 0) {
    throw new Error(defects.join('\n'));
  }
}

/** Renders one template against the record; an unconfigured surface renders empty rather than compiling nothing. */
function renderTemplate(template: string, record: ChangeRecord): string {
  return template === '' ? '' : render(compileTemplate(template), record);
}

/** Resolves the `_data` directory shipped beside the installed helper, holding the work-type taxonomy. */
function resolveDefaultDataDir(): string {
  const helperDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(helperDir, '..', 'skills', '_data');
}

/**
 * Resolves a merge from the invocation: reads the pull request's body from its file and its record block from the body,
 * resolves its labels through the repository's label map, derives its head from its commits, and hands all of it to
 * `resolveMerge`. The body file is read relative to the invoking directory, and the label map and the commits from the
 * repository root.
 */
async function resolveMergeRun(input: {
  args: ResolveMergeArgs;
  cwd: string;
  projectRoot: string;
  taxonomy: Taxonomy;
  templates: Record<Surface, string>;
}): Promise<MergeReport> {
  const { args } = input;
  const bodyPath = path.resolve(input.cwd, args.prBodyFile);
  let body: string;
  try {
    body = await readFile(bodyPath, 'utf8');
  } catch (error) {
    throw chainError(`--pr-body-file ${bodyPath} cannot be read`, error);
  }

  const labelMap = await readLabelMap(path.join(input.projectRoot, '.meta', 'label-map.json'));
  const derivation = await deriveMergeHead({
    args,
    cwd: input.projectRoot,
    taxonomy: input.taxonomy,
    template: input.templates.commit,
  });
  return resolveMerge({
    block: readChangeRecordBlock(body),
    derivation,
    labeled: resolveLabeledHead(labelMap, args.prLabels),
    overrides: args.overrides,
    pr: { body, headCommit: args.headCommit, number: args.prNumber, title: args.prTitle },
    taxonomy: input.taxonomy,
    templates: input.templates,
    ...(args.ticketRef !== undefined && { ticketRef: args.ticketRef }),
  });
}

// endregion | Helpers
