import { readNoteContent, renderNote } from '@williamthorsen/kb/note-io';
import { type KbEvent, parseEvent, renderEvent } from '@williamthorsen/kb/records';

import type { CaptureContext, ParsedArgs } from './types.ts';

/** A prepared event ready to write. */
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
 * Composes a `KbEvent` from the agent-supplied args and the auto-filled context, and renders it as the note to write.
 *
 * An event carries a single canonical state, edited in place through `capture-event --amend`, so the record has no
 * `updated` or `last-verified` field. Rendering through the same `renderEvent`/`renderNote` path that an amend uses
 * keeps a fresh capture and its later amendments identical in field order.
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
