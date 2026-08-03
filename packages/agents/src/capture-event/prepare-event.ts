import { readNoteContent, renderNote } from '@williamthorsen/kb/note-io';
import { type KbEvent, parseEvent, renderEvent } from '@williamthorsen/kb/records';

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

/** Validation failure: the human-readable errors that blocked the event. */
export interface PrepareFailure {
  ok: false;
  errors: string[];
}

/** The outcome of preparing an event for write. */
export type PrepareOutcome = PrepareSuccess | PrepareFailure;

/**
 * Composes a `KbEvent` from agent-supplied args and auto-filled context, renders it through the record module's
 * `renderEvent`, and validates the serialized note as an `event` record by re-parsing through `parseEvent`. The record
 * carries the stored `recordType: event` discriminant and the typed event spine (`id`, `captured-at`, `cwd`, `summary`,
 * plus `session` when the harness exposes one and any supplied `tags`/`impact`); `repo`/`skill`/`model`/`harness` have
 * no typed field and ride in `extra`, which `renderEvent` emits after the spine. No `updated`/`last-verified` field is
 * written: an event carries a single canonical state, editable in place via `capture-event --amend`.
 *
 * Rendering the composed record through the same `renderEvent`/`renderNote` path the amend path uses keeps a fresh
 * capture and its later amendments identical in field order. Validation round-trips the serialized note through
 * `readNoteContent` and `parseEvent`; when the record does not validate, the outcome is `{ ok: false, errors }` and
 * nothing is written.
 */
export function prepareEvent(input: {
  args: ParsedArgs;
  context: CaptureContext;
  id: string;
  capturedAt: string;
  body: string;
}): PrepareOutcome {
  const { args, context, id, capturedAt, body } = input;

  const extra: Record<string, unknown> = {};
  if (context.repo !== undefined) {
    extra.repo = context.repo;
  }
  if (args.skill !== null) {
    extra.skill = args.skill;
  }
  if (args.model !== null) {
    extra.model = args.model;
  }
  if (args.harness !== null) {
    extra.harness = args.harness;
  }

  const record: KbEvent = {
    recordType: 'event',
    id,
    capturedAt,
    ...(context.session !== undefined && { session: context.session }),
    cwd: context.cwd,
    summary: args.summary,
    tags: args.tags,
    addressedBy: [],
    ...(args.impact !== null && { impact: args.impact }),
    extra,
    body,
  };

  const rendered = renderEvent(record);
  const content = renderNote(rendered.fields, rendered.body);

  const errors = validate(content);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, prepared: { id, capturedAt, content } };
}

// region | Helpers

/** Re-parses the rendered note and validates it as an `event` record, returning any validation errors. */
function validate(content: string): string[] {
  const { fields, body } = readNoteContent(content);
  const result = parseEvent(fields, body);
  return result.ok ? [] : result.errors;
}

// endregion | Helpers
