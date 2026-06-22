import { asStringList, isValidDate } from '../note-io/field-validators.ts';

// The `assertion` record: the canonical knowledge-base note. Its required fields are the typed, validated contract;
// any other frontmatter field is preserved verbatim in `extra` for faithful round-trip and is promoted to a typed
// field by the operation that comes to depend on it.

/** A parsed `assertion` record: its required fields, the body, and any other frontmatter preserved in `extra`. */
export interface KbAssertion {
  recordType: 'assertion';
  title: string;
  created: string;
  updated: string;
  tags: string[];
  extra: Record<string, unknown>;
  body: string;
}

/** The outcome of parsing frontmatter as an assertion: the typed record, or the validation errors that blocked it. */
export type ParseAssertionResult = { ok: true; record: KbAssertion } | { ok: false; errors: string[] };

const TYPED_FIELDS = new Set(['recordType', 'title', 'created', 'updated', 'tags']);

/** Validates a frontmatter field map as an assertion and projects it onto a {@link KbAssertion}, accumulating every error. */
export function parseAssertion(fields: Record<string, unknown>, body: string): ParseAssertionResult {
  const errors: string[] = [];

  if (fields.recordType !== 'assertion') {
    errors.push('recordType: expected "assertion"');
  }

  let title: string | undefined;
  if (typeof fields.title === 'string' && fields.title.length > 0) {
    title = fields.title;
  } else {
    errors.push('missing required field: title');
  }

  const created = requireDate(fields.created, 'created', errors);
  const updated = requireDate(fields.updated, 'updated', errors);

  let tags: string[] | undefined;
  if (fields.tags === undefined) {
    errors.push('missing required field: tags');
  } else {
    const list = asStringList(fields.tags);
    if (list === null) {
      errors.push('tags: must be a list');
    } else {
      tags = list;
    }
  }

  if (
    errors.length > 0 ||
    title === undefined ||
    created === undefined ||
    updated === undefined ||
    tags === undefined
  ) {
    return { ok: false, errors };
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!TYPED_FIELDS.has(key)) {
      extra[key] = value;
    }
  }

  return { ok: true, record: { recordType: 'assertion', title, created, updated, tags, extra, body } };
}

/** Projects an assertion back to a frontmatter field map (typed fields first, then preserved `extra`) plus its body. */
export function renderAssertion(record: KbAssertion): { fields: Record<string, unknown>; body: string } {
  const fields: Record<string, unknown> = {
    recordType: record.recordType,
    title: record.title,
    created: record.created,
    updated: record.updated,
    tags: record.tags,
    ...record.extra,
  };
  return { fields, body: record.body };
}

// region | Helpers

/** Reads a required date field, pushing an error when it is absent or not a valid UTC instant; returns the value or `undefined`. */
function requireDate(value: unknown, field: string, errors: string[]): string | undefined {
  if (typeof value !== 'string') {
    errors.push(`missing required field: ${field}`);
    return undefined;
  }
  if (!isValidDate(value)) {
    errors.push(`${field}: expected a YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ date`);
    return undefined;
  }
  return value;
}

// endregion | Helpers
