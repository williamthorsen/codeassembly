import { renderNote, writeNote } from '@codeassembly/kb/note-io';
import { type KbAssertion, parseAssertion, renderAssertion } from '@codeassembly/kb/records';

/** A rendered record that re-parsed cleanly: the frontmatter field map, the body, and the serialized note content. */
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
 * Renders a record to its frontmatter field map and body, then re-parses that output as a defensive round-trip guard.
 * Returns the rendered fields, body, and serialized note content on success, or the re-parse errors on failure. The
 * guard should not trip for a record obtained from `parseAssertion` and mutated by an operation, but it guarantees a
 * never-written note can never leave the assertion contract.
 */
export function renderGuarded(record: KbAssertion): RenderedNote | RenderFailure {
  const { fields, body } = renderAssertion(record);
  const guard = parseAssertion(fields, body);
  if (!guard.ok) {
    return { ok: false, errors: guard.errors };
  }
  return { ok: true, fields, body, content: renderNote(fields, body) };
}

/** Successful write-back: the note has been re-rendered and atomically replaced. */
export interface WriteBackSuccess {
  ok: true;
  /** The bytes that were written, for callers that want to assert on the final content. */
  content: string;
}

/** Validation failure: the rendered frontmatter did not re-parse as an assertion. */
export interface WriteBackFailure {
  ok: false;
  reason: 'validation';
  errors: string[];
}

/** The outcome of an atomic write-back. */
export type WriteBackOutcome = WriteBackSuccess | WriteBackFailure;

/**
 * Guards the rendered record and, on pass, atomically rewrites the file at `path`. Operations call this rather than
 * touching `writeFile` directly so the round-trip guard cannot be bypassed. The write is atomic via a same-directory
 * temp file plus `rename` (handled by `writeNote`).
 */
export async function writeBackNote(input: { path: string; record: KbAssertion }): Promise<WriteBackOutcome> {
  const rendered = renderGuarded(input.record);
  if (!rendered.ok) {
    return { ok: false, reason: 'validation', errors: rendered.errors };
  }

  await writeNote(input.path, rendered.fields, rendered.body);

  return { ok: true, content: rendered.content };
}
