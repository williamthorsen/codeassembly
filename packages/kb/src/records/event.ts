import { isValidDate } from '../note-io/field-validators.ts';

// The `event` record: the ULID-keyed observation captured to refine assertions. Its required fields are the typed,
// validated contract; any other frontmatter field (e.g. `repo`, `addressed-by`) is preserved verbatim in `extra` for
// faithful round-trip and is promoted to a typed field by the operation that comes to depend on it.

/** A parsed `event` record: its required fields, the body, and any other frontmatter preserved in `extra`. */
export interface KbEvent {
  recordType: 'event';
  id: string;
  capturedAt: string;
  session: string;
  cwd: string;
  summary: string;
  extra: Record<string, unknown>;
  body: string;
}

/** The outcome of parsing frontmatter as an event: the typed record, or the validation errors that blocked it. */
export type ParseEventResult = { ok: true; record: KbEvent } | { ok: false; errors: string[] };

const TYPED_FIELDS = new Set(['recordType', 'id', 'captured-at', 'session', 'cwd', 'summary']);

/** Validates a frontmatter field map as an event and projects it onto a {@link KbEvent}, accumulating every error. */
export function parseEvent(fields: Record<string, unknown>, body: string): ParseEventResult {
  const errors: string[] = [];

  if (fields.recordType !== 'event') {
    errors.push('recordType: expected "event"');
  }

  const id = requireString(fields.id, 'id', errors);
  const session = requireString(fields.session, 'session', errors);
  const cwd = requireString(fields.cwd, 'cwd', errors);
  const summary = requireString(fields.summary, 'summary', errors);

  let capturedAt: string | undefined;
  const rawCapturedAt = fields['captured-at'];
  if (typeof rawCapturedAt !== 'string') {
    errors.push('missing required field: captured-at');
  } else if (!isValidDate(rawCapturedAt)) {
    errors.push('captured-at: expected a YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ date');
  } else {
    capturedAt = rawCapturedAt;
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    capturedAt === undefined ||
    session === undefined ||
    cwd === undefined ||
    summary === undefined
  ) {
    return { ok: false, errors };
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!TYPED_FIELDS.has(key)) {
      extra[key] = value;
    }
  }

  return { ok: true, record: { recordType: 'event', id, capturedAt, session, cwd, summary, extra, body } };
}

/** Projects an event back to a frontmatter field map (typed fields first, then preserved `extra`) plus its body. */
export function renderEvent(record: KbEvent): { fields: Record<string, unknown>; body: string } {
  const fields: Record<string, unknown> = {
    recordType: record.recordType,
    id: record.id,
    'captured-at': record.capturedAt,
    session: record.session,
    cwd: record.cwd,
    summary: record.summary,
    ...record.extra,
  };
  return { fields, body: record.body };
}

// region | Helpers

/** Reads a required string field, pushing an error when it is absent or empty; returns the value or `undefined`. */
function requireString(value: unknown, field: string, errors: string[]): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  errors.push(`missing required field: ${field}`);
  return undefined;
}

// endregion | Helpers
