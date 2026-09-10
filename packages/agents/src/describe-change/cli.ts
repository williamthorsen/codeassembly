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
import { loadPreferences, resolveProjectRoot } from './load-preferences.ts';
import { isSurface, type ParsedArgs, type ParseOutcome, type RenderedTitles, type Surface, SURFACES } from './types.ts';

/** The flags this helper accepts; it reads nothing from stdin. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'breaking', takesValue: false },
  { name: 'parse', takesValue: true },
  { name: 'pr-number', takesValue: true },
  { name: 'scope', takesValue: true },
  { name: 'ticket-ref', takesValue: true },
  { name: 'title', takesValue: true },
  { name: 'type', takesValue: true },
];

/** The name this helper reports itself under on stderr. */
const PROGRAM = 'describe-change';

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
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals, flags } = scanFlags(argv, FLAGS);
  const values = valueFlagMap(flags);

  const surface = values.parse;
  if (surface !== undefined) {
    return parseReadArgs(surface, positionals, flags);
  }
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }

  const record: ChangeRecord = {
    ...(flags.some((flag) => flag.name === 'breaking') && { breaking: true }),
    ...(values['pr-number'] !== undefined && { prNumber: values['pr-number'] }),
    ...(values.scope !== undefined && { scope: values.scope }),
    ...(values['ticket-ref'] !== undefined && { ticketRef: values['ticket-ref'] }),
    ...(values.title !== undefined && { title: values.title }),
    ...(values.type !== undefined && { type: values.type }),
  };
  return { mode: 'render', record };
}

/**
 * Runs the helper end to end: parses args, resolves the templates from the project and global preferences files,
 * refuses any template the engine cannot round-trip, and then renders or reads a subject.
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
  output: ParseOutcome | RenderedTitles;
  warnings: string[];
}

// region | Helpers

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
