import { readFile } from 'node:fs/promises';

import { parseFrontmatterFields } from './yaml-fields.ts';

const FENCE = '---';

/** The outcome of splitting a note: its frontmatter field map, its body, and any frontmatter parse error. */
export interface ReadNote {
  fields: Record<string, unknown>;
  body: string;
  error?: string;
}

/** Reads a note file from disk and splits it into a frontmatter field map and body. I/O errors are thrown. */
export async function readNote(path: string): Promise<ReadNote> {
  const content = await readFile(path, 'utf8');
  return readNoteContent(content);
}

/**
 * Splits note content into a frontmatter field map and body. A missing frontmatter block or a YAML parse error is
 * reported in `error` (never thrown), with the full content returned as the body so callers can still surface it.
 */
export function readNoteContent(content: string): ReadNote {
  const lines = content.split('\n');
  if (lines[0] !== FENCE) {
    return { fields: {}, body: content, error: 'no frontmatter block found' };
  }
  const endIndex = lines.findIndex((line, index) => index > 0 && line === FENCE);
  if (endIndex === -1) {
    return { fields: {}, body: content, error: 'no frontmatter block found' };
  }
  const text = lines.slice(1, endIndex).join('\n');
  const body = lines.slice(endIndex + 1).join('\n');
  const { fields, error } = parseFrontmatterFields(text);
  return { fields, body, ...(error !== undefined && { error }) };
}
