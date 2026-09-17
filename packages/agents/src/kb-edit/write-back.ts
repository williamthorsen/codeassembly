import { renderNote, writeNote } from '@williamthorsen/kb/note-io';
import { type KbAssertion, parseAssertion, renderAssertion } from '@williamthorsen/kb/records';

/** A rendered record that re-parsed cleanly. */
export interface RenderedNote {
  ok: true;
  fields: Record<string, unknown>;
  body: string;
  content: string;
}

/** A record whose rendered frontmatter failed to re-parse as an assertion. */
export interface RenderFailure {
  ok: false;
  errors: string[];
}

/**
 * Renders a record to its frontmatter field map and body, then re-parses that output as a round-trip guard.
 *
 * The guard is expected to pass for any record that `parseAssertion` produced and an operation then mutated; it keeps
 * a record that has left the assertion contract from reaching disk.
 */
export function renderGuarded(record: KbAssertion): RenderedNote | RenderFailure {
  const { fields, body } = renderAssertion(record);
  const guard = parseAssertion(fields, body);
  if (!guard.ok) {
    return { ok: false, errors: guard.errors };
  }
  return { ok: true, fields, body, content: renderNote(fields, body) };
}

export interface WriteBackSuccess {
  ok: true;
  /** The bytes that were written. */
  content: string;
}

/** Validation failure: the rendered frontmatter did not re-parse as an assertion. */
export interface WriteBackFailure {
  ok: false;
  reason: 'validation';
  errors: string[];
}

export type WriteBackOutcome = WriteBackSuccess | WriteBackFailure;

/**
 * Guards the rendered record and, on pass, atomically rewrites the file at `path`. Every operation writes through this
 * function, so the round-trip guard cannot be bypassed.
 */
export async function writeBackNote(input: { path: string; record: KbAssertion }): Promise<WriteBackOutcome> {
  const rendered = renderGuarded(input.record);
  if (!rendered.ok) {
    return { ok: false, reason: 'validation', errors: rendered.errors };
  }

  await writeNote(input.path, rendered.fields, rendered.body);

  return { ok: true, content: rendered.content };
}
