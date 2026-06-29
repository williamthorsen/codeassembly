import type { Finding, Schema } from '@codeassembly/kb';
import { parseNoteContent } from '@codeassembly/kb/frontmatter';
import { frontmatterRule, runRules } from '@codeassembly/kb/rules';
import { stringify } from 'yaml';

import type { CaptureContext, ParsedArgs } from './types.ts';

/** A prepared event ready to write: its ULID-keyed filename stem and the full rendered note content. */
export interface PreparedEvent {
  /** The event's ULID, also the filename stem. */
  id: string;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
  /** The full note content (frontmatter fence plus body) to write. */
  content: string;
}

/** Successful preparation: the rendered event note. */
export interface PrepareSuccess {
  ok: true;
  prepared: PreparedEvent;
}

/** Schema-validation failure: the error-severity findings the helper turns into a structured result. */
export interface PrepareFailure {
  ok: false;
  findings: Finding[];
}

/** The outcome of preparing an event for write. */
export type PrepareOutcome = PrepareSuccess | PrepareFailure;

/**
 * Assembles an event record from agent-supplied args and auto-filled context, renders it to a note string, and
 * validates the result against the store's schema via `frontmatterRule`. The record carries the stored
 * `recordType: event` discriminant and the event spine (`id`, `captured-at`, `session`, `cwd`, `repo`, `summary`) plus
 * any supplied `skill`/`model`/`harness`/`tags`/`impact`. No `updated`/`last-verified` field is written: an event
 * carries a single canonical state, editable in place via `capture-event --amend` until it is pushed and immutable
 * after.
 *
 * Validation round-trips the rendered note through `parseNoteContent` and `runRules`, mirroring `kb-add`'s
 * prepare-then-validate flow. When any finding has `severity: 'error'`, the outcome is `{ ok: false, findings }` and
 * nothing is written.
 */
export function prepareEvent(input: {
  args: ParsedArgs;
  context: CaptureContext;
  id: string;
  capturedAt: string;
  schema: Schema;
  body: string;
}): PrepareOutcome {
  const { args, context, id, capturedAt, schema, body } = input;

  const fields: Array<[string, string | string[]]> = [
    ['recordType', 'event'],
    ['id', id],
    ['captured-at', capturedAt],
    ['session', context.session],
    ['cwd', context.cwd],
  ];
  if (context.repo !== undefined) {
    fields.push(['repo', context.repo]);
  }
  fields.push(['summary', args.summary]);
  if (args.skill !== null) {
    fields.push(['skill', args.skill]);
  }
  if (args.model !== null) {
    fields.push(['model', args.model]);
  }
  if (args.harness !== null) {
    fields.push(['harness', args.harness]);
  }
  if (args.tags.length > 0) {
    fields.push(['tags', args.tags]);
  }
  if (args.impact !== null) {
    fields.push(['impact', args.impact]);
  }

  const content = renderEventNote(fields, body);

  const findings = validate({ content, schema });
  const errorFindings = findings.filter((finding) => finding.severity === 'error');
  if (errorFindings.length > 0) {
    return { ok: false, findings: errorFindings };
  }

  return { ok: true, prepared: { id, capturedAt, content } };
}

// region | Helpers

/** Re-parses the rendered note and runs the frontmatter rule against it under the store's schema. */
function validate(input: { content: string; schema: Schema }): Finding[] {
  const parsed = parseNoteContent({ content: input.content, path: '<capture-event proposal>' });
  return runRules({ rules: [frontmatterRule], notes: [parsed], schema: input.schema });
}

/**
 * Renders the event frontmatter in declaration order followed by the body. Each value is delegated to the `yaml`
 * serializer's `core`-schema stringifier so a value that would otherwise re-parse as a non-string (e.g. a numeric
 * `summary`) is quoted and round-trips faithfully.
 */
function renderEventNote(fields: ReadonlyArray<[string, string | string[]]>, body: string): string {
  const lines = ['---'];
  for (const [key, value] of fields) {
    lines.push(`${key}: ${Array.isArray(value) ? renderFlowList(value) : renderScalar(value)}`);
  }
  lines.push('---', '');
  const normalizedBody = body.startsWith('\n') ? body.slice(1) : body;
  return `${lines.join('\n')}\n${normalizedBody}`;
}

/** Renders a string array as a flow-style `[a, b, c]` sequence. */
function renderFlowList(values: readonly string[]): string {
  return `[${values.map((value) => renderScalar(value)).join(', ')}]`;
}

/** Renders a string scalar, delegating the quoting decision to the `yaml` core-schema stringifier. */
function renderScalar(value: string): string {
  const rendered = stringify(value, SCALAR_STRINGIFY_OPTIONS).replace(/\n$/, '');
  if (rendered.includes('\n')) {
    return stringify(value, { ...SCALAR_STRINGIFY_OPTIONS, defaultStringType: 'QUOTE_DOUBLE' }).replace(/\n$/, '');
  }
  return rendered;
}

// Mirrors `write-frontmatter.ts`: `core` schema plus plain default keeps round-trip-safe strings unquoted and quotes
// only those that would re-parse to a non-string.
const SCALAR_STRINGIFY_OPTIONS = {
  schema: 'core',
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
  singleQuote: true,
  lineWidth: 0,
} as const;

// endregion | Helpers
