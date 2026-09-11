/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { compileTemplate } from '../change-grammar/compile-template.ts';
import { parse } from '../change-grammar/parse.ts';
import { render } from '../change-grammar/render.ts';
import type { ChangeRecord, Taxonomy } from '../change-grammar/types.ts';
import { verify } from '../change-grammar/verify.ts';
import { type FlagSpec, type MatchedFlag, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { loadTaxonomy } from '../lib/work-types.ts';
import { type RecordOverrides, renderChangeRecordBlock } from './change-record-block.ts';
import { classifyCommits } from './classify.ts';
import { loadPreferences, resolveProjectRoot } from './load-preferences.ts';
import { readCommits } from './read-commits.ts';
import { resolveTicketType } from './resolve-ticket-type.ts';
import {
  type ClassifyOutcome,
  isSurface,
  type ParsedArgs,
  type ParseOutcome,
  type RecordBlockOutcome,
  type RenderedTitles,
  type Surface,
  SURFACES,
} from './types.ts';

/** The flags this helper accepts; it reads nothing from stdin. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'breaking', takesValue: false },
  { name: 'classify', takesValue: true },
  { name: 'override-breaking', takesValue: false },
  { name: 'override-scope', takesValue: true },
  { name: 'override-type', takesValue: true },
  { name: 'parse', takesValue: true },
  { name: 'pr-number', takesValue: true },
  { name: 'record-block', takesValue: true },
  { name: 'scope', takesValue: true },
  { name: 'ticket-label', takesValue: true },
  { name: 'ticket-ref', takesValue: true },
  { name: 'title', takesValue: true },
  { name: 'type', takesValue: true },
];

/** The flags that each select a mode other than rendering, so no two of them may appear together. */
const MODE_FLAGS: readonly string[] = ['classify', 'parse', 'record-block'];

/** The flags that set an override, which only a `change-record` block records. */
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
 * `--type`, and `--breaking`, and reads the author's overrides from the `--override-*` flags, which mean nothing in any
 * other mode. The three non-rendering modes are mutually exclusive.
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
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
  if (values['ticket-label'] !== undefined) {
    throw new Error('--ticket-label resolves a ticket type for --classify, so it takes no meaning on its own');
  }
  const override = flags.find((flag) => OVERRIDE_FLAGS.has(flag.name));
  if (override !== undefined) {
    throw new Error(`--${override.name} sets an override for --record-block, so it takes no meaning on its own`);
  }

  return { mode: 'render', record: readRecordFlags(flags) };
}

/**
 * Runs the helper end to end: parses args, resolves the templates from the project and global preferences files,
 * refuses any template the engine cannot round-trip, and then renders titles, reads a subject, classifies a commit
 * range, or renders a `change-record` block.
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
  output: ClassifyOutcome | ParseOutcome | RecordBlockOutcome | RenderedTitles;
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

/** Resolves the `_data` directory shipped beside the installed helper, holding the work-type taxonomy. */
function resolveDefaultDataDir(): string {
  const helperDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(helperDir, '..', 'skills', '_data');
}

/** Renders one template against the record; an unconfigured surface renders empty rather than compiling nothing. */
function renderTemplate(template: string, record: ChangeRecord): string {
  return template === '' ? '' : render(compileTemplate(template), record);
}

// endregion | Helpers
