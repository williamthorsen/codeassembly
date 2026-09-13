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
import { type FlagSpec, type MatchedFlag, scanFlags, type ScanResult, valueFlagMap } from '../lib/parse-flags.ts';
import { loadTaxonomy } from '../lib/work-types.ts';
import { readChangeRecordBlock, type RecordOverrides, renderChangeRecordBlock } from './change-record-block.ts';
import { classifyCommits } from './classify.ts';
import { loadPreferences, resolveProjectRoot } from './load-preferences.ts';
import { MissingCommitError, readCommits } from './read-commits.ts';
import { readLabelMap, resolveLabeledHead } from './read-label-map.ts';
import { type MergeInput, type MergeOverrides, type MergeReport, resolveMerge } from './resolve-merge.ts';
import { resolveTicketType } from './resolve-ticket-type.ts';
import {
  type ConsolidateBranchOutcome,
  isSurface,
  type ParsedArgs,
  type ParseTitleOutcome,
  type RenderBlockOutcome,
  type RenderedTitles,
  type ResolveMergeArgs,
  type Subcommand,
  type Surface,
  SURFACES,
  type TicketTypeOutcome,
} from './types.ts';

/** The flags that set an override, which a `change-record` block records and a merge applies. */
const OVERRIDE_FLAGS: readonly FlagSpec[] = [
  { name: 'override-breaking', takesValue: false },
  { name: 'override-scope', takesValue: true },
  { name: 'override-type', takesValue: true },
];

/** The name this helper reports itself under on stderr. */
const PROGRAM = 'describe-change';

/** The flags that set a record's title, scope, type, and breaking marker. */
const RECORD_FLAGS: readonly FlagSpec[] = [
  { name: 'breaking', takesValue: false },
  { name: 'scope', takesValue: true },
  { name: 'title', takesValue: true },
  { name: 'type', takesValue: true },
];

/**
 * Each subcommand's flags, and the reader of its scanned arguments, in the order the usage error lists them.
 *
 * @internal - Exported to allow testing.
 */
export const SUBCOMMANDS: Record<Subcommand, SubcommandSpec> = {
  'render-titles': {
    flags: [...RECORD_FLAGS, { name: 'pr-number', takesValue: true }, { name: 'ticket-ref', takesValue: true }],
    read: readRenderTitlesArgs,
  },
  'parse-title': { flags: [], read: readParseTitleArgs },
  'consolidate-branch': { flags: [{ name: 'base', takesValue: true }], read: readConsolidateBranchArgs },
  'resolve-ticket-type': { flags: [{ name: 'ticket-label', takesValue: true }], read: readResolveTicketTypeArgs },
  'render-block': { flags: [...RECORD_FLAGS, ...OVERRIDE_FLAGS], read: readRenderBlockArgs },
  'resolve-merge': {
    flags: [
      { name: 'base', takesValue: true },
      { name: 'head', takesValue: true },
      { name: 'no-override-breaking', takesValue: false },
      ...OVERRIDE_FLAGS,
      { name: 'override-title', takesValue: true },
      { name: 'pr-body-file', takesValue: true },
      { name: 'pr-label', takesValue: true },
      { name: 'pr-number', takesValue: true },
      { name: 'pr-title', takesValue: true },
      { name: 'ticket-ref', takesValue: true },
    ],
    read: readResolveMergeArgs,
  },
};

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
 * Parses the helper's argv into what the run asks for. The first argument names the subcommand, and the rest are
 * scanned against that subcommand's flags alone, so a flag that only another subcommand takes is refused as unknown.
 *
 * `render-titles` and `render-block` accept `--type feat!`, which the engine splits into the bare type and the breaking
 * marker. An `--override-type` carrying the marker is refused, since the breaking overrides set it.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || !isSubcommand(subcommand)) {
    throw new Error(buildUsageMessage(subcommand));
  }
  const { flags, read } = SUBCOMMANDS[subcommand];
  return read(scanFlags(rest, flags));
}

/**
 * Runs the helper end to end: parses args, then runs the subcommand they name, loading only what that subcommand reads.
 * A subcommand that loads the title templates refuses any template the engine cannot round-trip, so a defective template
 * refuses neither `render-block` nor `resolve-ticket-type`, which load none.
 *
 * A subcommand that reads the repository warns outside one and anchors its lookups at `cwd` rather than failing, since a
 * title still renders from the global templates. An unreadable taxonomy warns under `render-titles`, which renders
 * without one, and refuses every other subcommand that loads templates.
 *
 * @internal - Exported to allow testing.
 */
export async function runDescribe(input: DescribeInput): Promise<DescribeResult> {
  const args = parseArgs(input.argv);
  switch (args.subcommand) {
    case 'consolidate-branch':
      return runConsolidateBranch(args.baseRef, input);
    case 'parse-title':
      return runParseTitle(args.surface, args.subject, input);
    case 'render-block':
      return { output: { block: renderChangeRecordBlock(args.block) }, warnings: [] };
    case 'render-titles':
      return runRenderTitles(args.record, input);
    case 'resolve-merge':
      return runResolveMerge(args.merge, input);
    case 'resolve-ticket-type':
      return runResolveTicketType(args.ticketLabels, input);
  }
}

/** What a run reads: its argv, the directory it was invoked from, the taxonomy's directory, and the home directory. */
export interface DescribeInput {
  argv: readonly string[];
  cwd: string;
  dataDir: string;
  home: string;
}

/** What a completed run writes: the JSON payload for stdout, and the diagnostics for stderr. */
export interface DescribeResult {
  output:
    | ConsolidateBranchOutcome
    | MergeReport
    | ParseTitleOutcome
    | RenderBlockOutcome
    | RenderedTitles
    | TicketTypeOutcome;
  warnings: string[];
}

// region | Helpers

/** The project root, the templates it resolves to, the taxonomy where one is readable, and what loading reported. */
interface LoadedTemplates {
  projectRoot: string;
  taxonomy: Taxonomy | null;
  templates: Record<Surface, string>;
  warnings: string[];
}

/** One subcommand's flags, and the reader that turns its scanned arguments into what the run asks for. */
interface SubcommandSpec {
  flags: readonly FlagSpec[];
  read: (scan: ScanResult) => ParsedArgs;
}

/** Builds the usage error for a missing or unknown subcommand, listing every subcommand the helper takes. */
function buildUsageMessage(subcommand: string | undefined): string {
  const usage = `usage: ${PROGRAM} <subcommand> [flags], where <subcommand> is one of ${Object.keys(SUBCOMMANDS).join(', ')}`;
  return subcommand === undefined ? `a subcommand is required; ${usage}` : `unknown subcommand ${subcommand}; ${usage}`;
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

/** Reports whether `value` names one of the helper's subcommands. */
function isSubcommand(value: string): value is Subcommand {
  return Object.hasOwn(SUBCOMMANDS, value);
}

/**
 * Resolves the project root and the templates its preferences files configure, then refuses any configured template
 * the engine cannot round-trip, where a taxonomy is readable to verify against.
 */
async function loadTemplates(input: DescribeInput): Promise<LoadedTemplates> {
  const { projectRoot, warning } = await resolveProjectRoot(input.cwd);
  const { templates, warnings } = await loadPreferences({ home: input.home, projectRoot });
  if (warning !== undefined) {
    warnings.unshift(warning);
  }

  const taxonomy = await loadTaxonomy(input.dataDir);
  if (taxonomy !== null) {
    refuseUnverifiableTemplates(templates, taxonomy);
  }
  return { projectRoot, taxonomy, templates, warnings };
}

/** Loads the templates for a subcommand that cannot run without the taxonomy, prefixing the refusal with `reason`. */
async function loadTemplatesWithTaxonomy(
  input: DescribeInput,
  reason: string,
): Promise<LoadedTemplates & { taxonomy: Taxonomy }> {
  const loaded = await loadTemplates(input);
  const { taxonomy } = loaded;
  if (taxonomy === null) {
    throw new Error(`${reason}; none is readable under ${input.dataDir}`);
  }
  return { ...loaded, taxonomy };
}

/** Reads the `consolidate-branch` invocation: the base ref of the range to read. */
function readConsolidateBranchArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return {
    baseRef: readRequiredValue('consolidate-branch', valueFlagMap(flags), 'base'),
    subcommand: 'consolidate-branch',
  };
}

/** Reads `--override-type`, refusing a type that carries the breaking marker. */
function readOverrideType(values: Record<string, string>): string | undefined {
  const type = values['override-type']?.trim();
  if (type?.endsWith(BREAKING_MARKER) === true) {
    throw new Error('--override-type takes a bare type; pass --override-breaking for a breaking change');
  }
  return type;
}

/** Reads the `parse-title` invocation: the surface whose template reads the subject, then the subject itself. */
function readParseTitleArgs({ positionals }: ScanResult): ParsedArgs {
  const [surface, subject] = positionals;
  if (surface === undefined || subject === undefined) {
    throw new Error('parse-title takes the surface and the subject string to read');
  }
  if (!isSurface(surface)) {
    throw new Error(`parse-title must name one of ${SURFACES.join(', ')}`);
  }
  refusePositionals(positionals.slice(2));
  return { subcommand: 'parse-title', subject, surface };
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

/** Reads the `render-block` invocation: the required title, the consolidated record's flags, and the author's overrides. */
function readRenderBlockArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  const values = valueFlagMap(flags);
  const title = readRequiredValue('render-block', values, 'title');
  const type = readOverrideType(values);
  const { title: _title, ...consolidatedRecord } = readRecordFlags(flags);
  const overrides: RecordOverrides = {
    ...(flags.some((flag) => flag.name === 'override-breaking') && { breaking: true }),
    ...(values['override-scope'] !== undefined && { scope: values['override-scope'] }),
    ...(type !== undefined && { type }),
  };
  return { block: { consolidatedRecord, overrides, title }, subcommand: 'render-block' };
}

/**
 * Reads the `render-titles` invocation into a record. Every flag is optional, and a flag left off resolves its token to
 * empty, so an invocation carrying no flags renders each template against an empty record.
 */
function readRenderTitlesArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return { record: readRecordFlags(flags), subcommand: 'render-titles' };
}

/** Collects every value of a repeatable flag, in the order the invocation passes them. */
function readRepeatedValues(flags: readonly MatchedFlag[], name: string): string[] {
  return flags.flatMap((flag) => (flag.name === name && flag.value !== null ? [flag.value] : []));
}

/** Reads a value flag that the subcommand requires, refusing one that is absent or blank. */
function readRequiredValue(subcommand: Subcommand, values: Record<string, string>, name: string): string {
  const value = values[name]?.trim();
  if (value === undefined || value === '') {
    throw new Error(`${subcommand} requires --${name}`);
  }
  return value;
}

/** Reads the `resolve-merge` invocation: the pull request's range and inputs, and the author's overrides. */
function readResolveMergeArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  const values = valueFlagMap(flags);
  const baseRef = readRequiredValue('resolve-merge', values, 'base');
  const prNumber = readRequiredValue('resolve-merge', values, 'pr-number');
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
  const type = readOverrideType(values);

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
    baseRef,
    headCommit: readRequiredValue('resolve-merge', values, 'head'),
    overrides,
    prBodyFile: readRequiredValue('resolve-merge', values, 'pr-body-file'),
    prLabels: readRepeatedValues(flags, 'pr-label'),
    prNumber,
    prTitle: readRequiredValue('resolve-merge', values, 'pr-title'),
    ...(ticketRef !== undefined && { ticketRef }),
  };
  return { merge, subcommand: 'resolve-merge' };
}

/** Reads the `resolve-ticket-type` invocation: every label the ticket carries. */
function readResolveTicketTypeArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return { subcommand: 'resolve-ticket-type', ticketLabels: readRepeatedValues(flags, 'ticket-label') };
}

/** Reads a subject back through one surface's template, reporting each field the record carries. */
function readSubject(surface: Surface, template: string, subject: string, taxonomy: Taxonomy): ParseTitleOutcome {
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

/** Refuses a positional argument that the subcommand does not take. */
function refusePositionals(positionals: readonly string[]): void {
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
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
 * Reads a range's commits and consolidates them, in the shape the JSON output names. Each entry is rendered back through
 * the template that read it, so its `change` is canonical whatever the subject it came from.
 */
async function runConsolidateBranch(baseRef: string, input: DescribeInput): Promise<DescribeResult> {
  const { projectRoot, taxonomy, templates, warnings } = await loadTemplatesWithTaxonomy(
    input,
    'consolidate-branch ranks types against the taxonomy',
  );
  if (templates.commit === '') {
    throw new Error('commit.title_format is empty, so a branch’s commits cannot be read back');
  }
  const commits = await readCommits({ baseRef, cwd: projectRoot });
  const nodes = compileTemplate(templates.commit);
  const classification = classifyCommits(commits, nodes, taxonomy);

  const output: ConsolidateBranchOutcome = {
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
    unclassified: classification.unclassified,
    violations: classification.violations,
  };
  return { output, warnings };
}

/** Reads a subject back through the named surface's template. */
async function runParseTitle(surface: Surface, subject: string, input: DescribeInput): Promise<DescribeResult> {
  const { taxonomy, templates, warnings } = await loadTemplatesWithTaxonomy(
    input,
    'parse-title resolves the type against the taxonomy',
  );
  return { output: readSubject(surface, templates[surface], subject, taxonomy), warnings };
}

/** Renders every surface's title from the record, warning rather than refusing where no taxonomy verifies the templates. */
async function runRenderTitles(record: ChangeRecord, input: DescribeInput): Promise<DescribeResult> {
  const { taxonomy, templates, warnings } = await loadTemplates(input);
  if (taxonomy === null) {
    warnings.push(`no readable work-types.json under ${input.dataDir}; templates are not verified`);
  }
  return {
    output: {
      commit_title: renderTemplate(templates.commit, record),
      ticket_title: renderTemplate(templates.ticket, record),
      pr_title: renderTemplate(templates.pr, record),
      merge_title: renderTemplate(templates.merge, record),
    },
    warnings,
  };
}

/**
 * Resolves a merge from the invocation: reads the pull request's body from its file and its record block from the body,
 * resolves its labels through the repository's label map, derives its head from its commits, and hands all of it to
 * `resolveMerge`. The body file is read relative to the invoking directory, and the label map and the commits from the
 * repository root.
 */
async function runResolveMerge(args: ResolveMergeArgs, input: DescribeInput): Promise<DescribeResult> {
  const { projectRoot, taxonomy, templates, warnings } = await loadTemplatesWithTaxonomy(
    input,
    'resolve-merge checks types against the taxonomy',
  );
  const bodyPath = path.resolve(input.cwd, args.prBodyFile);
  let body: string;
  try {
    body = await readFile(bodyPath, 'utf8');
  } catch (error) {
    throw chainError(`--pr-body-file ${bodyPath} cannot be read`, error);
  }

  const labelMap = await readLabelMap(path.join(projectRoot, '.meta', 'label-map.json'));
  const derivation = await deriveMergeHead({ args, cwd: projectRoot, taxonomy, template: templates.commit });
  const output = resolveMerge({
    block: readChangeRecordBlock(body),
    derivation,
    labeled: resolveLabeledHead(labelMap, args.prLabels),
    overrides: args.overrides,
    pr: { body, headCommit: args.headCommit, number: args.prNumber, title: args.prTitle },
    taxonomy,
    templates,
    ...(args.ticketRef !== undefined && { ticketRef: args.ticketRef }),
  });
  return { output, warnings };
}

/** Resolves the work type that the ticket's labels name through the repository's label map. */
async function runResolveTicketType(ticketLabels: readonly string[], input: DescribeInput): Promise<DescribeResult> {
  const { projectRoot, warning } = await resolveProjectRoot(input.cwd);
  const ticketType = await resolveTicketType({
    labelMapPath: path.join(projectRoot, '.meta', 'label-map.json'),
    labels: ticketLabels,
  });
  return { output: { ticket_type: ticketType ?? null }, warnings: warning === undefined ? [] : [warning] };
}

// endregion | Helpers
