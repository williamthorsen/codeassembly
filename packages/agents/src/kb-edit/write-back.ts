import { randomBytes } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';

import type { Finding, Frontmatter, Schema } from '@codeassembly/kb';
import { parseNoteContent, writeFrontmatter } from '@codeassembly/kb/frontmatter';
import { frontmatterRule, runRules } from '@codeassembly/kb/rules';

/**
 * Validates a rendered note string against the destination KB's schema, returning error-severity findings.
 * Round-trips through `parseNoteContent` so the rule sees a real `ParsedNote` carrying a `yaml.Document` and the
 * raw text positions it expects. Used by `writeBackNote` and by the supersede orchestrator (which needs to validate
 * both notes before either rename runs).
 */
export function validateFrontmatter(input: { content: string; path: string; schema: Schema }): Finding[] {
  const parsed = parseNoteContent({ content: input.content, path: input.path });
  return runRules({ rules: [frontmatterRule], notes: [parsed], schema: input.schema }).filter(
    (finding) => finding.severity === 'error',
  );
}

/** Successful write-back: the note has been re-rendered and atomically replaced. */
export interface WriteBackSuccess {
  ok: true;
  /** The bytes that were written, for callers that want to assert on the final content. */
  content: string;
}

/** Schema-validation failure: the proposed frontmatter does not pass the destination KB's schema. */
export interface WriteBackFailure {
  ok: false;
  reason: 'schema-validation';
  findings: Finding[];
}

/** The outcome of an atomic write-back. */
export type WriteBackOutcome = WriteBackSuccess | WriteBackFailure;

/**
 * Validates the proposed frontmatter against the destination KB's schema and, on pass, atomically rewrites the file
 * at `path` with the rendered note. Operations call this rather than touching `writeFile` directly so schema
 * enforcement cannot be bypassed.
 *
 * Validation runs by rendering the frontmatter to a note string, re-parsing it, and feeding the parsed shape through
 * `frontmatterRule`. Round-tripping through the parser is the cheapest way to give the rule a real `ParsedNote`
 * carrying a `yaml.Document` and the raw text positions it expects.
 *
 * The write is atomic via a same-directory temp file plus `rename`. On rename failure the temp file is cleaned up
 * best-effort and the error re-thrown so a permission or disk error surfaces unambiguously.
 */
export async function writeBackNote(input: {
  path: string;
  frontmatter: Frontmatter;
  body: string;
  schema: Schema;
}): Promise<WriteBackOutcome> {
  const content = writeFrontmatter({ frontmatter: input.frontmatter, body: input.body });

  const errorFindings = validateFrontmatter({ content, path: input.path, schema: input.schema });
  if (errorFindings.length > 0) {
    return { ok: false, reason: 'schema-validation', findings: errorFindings };
  }

  await atomicWrite({ targetPath: input.path, content });

  return { ok: true, content };
}

// region | Helpers

/**
 * Atomic write via same-directory temp file plus rename. The temp filename uses a random suffix so concurrent writes
 * to nearby paths cannot collide. A failed rename triggers a best-effort temp-file cleanup, then re-throws.
 */
async function atomicWrite(input: { targetPath: string; content: string }): Promise<void> {
  const tempPath = `${input.targetPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, input.content, 'utf8');
  try {
    await rename(tempPath, input.targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

// endregion | Helpers
