import { readFile } from 'node:fs/promises';

import { type Document, isMap, isPair, isScalar, isSeq, parseDocument } from 'yaml';

import { isRecord } from '../type-guards.ts';
import type { Frontmatter, FrontmatterRaw, ParsedNote } from '../types.ts';

const FENCE = '---';

/**
 * Reads a note from disk and parse it into a `ParsedNote`. I/O errors (e.g. a missing file) are thrown;
 * YAML parse errors are not.
 */
export async function parseNote(input: { path: string }): Promise<ParsedNote> {
  const content = await readFile(input.path, 'utf8');
  return parseNoteContent({ content, path: input.path });
}

/**
 * Parse a note from a literal string into a `ParsedNote` carrying typed frontmatter.
 * Parse errors are recorded in `frontmatterRaw.parseError`, never thrown — the rule layer decides how to report them.
 * `path` defaults to `<string>` and labels the result for diagnostics.
 */
export function parseNoteContent(input: { content: string; path?: string }): ParsedNote {
  const { content, path = '<string>' } = input;
  const lines = content.split('\n');
  if (lines[0] !== FENCE) {
    return { path, content, frontmatter: null, frontmatterRaw: null, body: content, bodyStartLine: 1 };
  }
  const endIndex = lines.findIndex((line, index) => index > 0 && line === FENCE);
  if (endIndex === -1) {
    return { path, content, frontmatter: null, frontmatterRaw: null, body: content, bodyStartLine: 1 };
  }

  const text = lines.slice(1, endIndex).join('\n');
  // `schema: 'core'` disables the YAML 1.1 timestamp tag so date fields surface as strings rather than JS `Date`
  // objects, keeping validator input uniform.
  const doc = parseDocument(text, { schema: 'core' });
  const parseError = doc.errors[0]?.message;
  const frontmatterRaw: FrontmatterRaw = {
    text,
    startLine: 1,
    endLine: endIndex + 1,
    ...(parseError !== undefined && { parseError }),
  };

  const body = lines.slice(endIndex + 1).join('\n');
  const bodyStartLine = endIndex + 2;
  const frontmatter = parseError === undefined ? toFrontmatter(doc) : null;

  return { path, content, frontmatter, frontmatterRaw, body, bodyStartLine };
}

// region | Helpers

/** Coerces a sequence node into a string array, dropping non-string items. */
function stringList(value: unknown): string[] {
  if (!isSeq(value)) {
    return [];
  }
  const result: string[] = [];
  for (const item of value.items) {
    if (isScalar(item) && typeof item.value === 'string') {
      result.push(item.value);
    }
  }
  return result;
}

/** Coerces a scalar node value to a string, treating absent values as empty. */
function stringValue(value: unknown): string {
  if (!isScalar(value)) {
    return '';
  }
  const raw = value.value;
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') {
    return String(raw);
  }
  return '';
}

/** Projects a parsed YAML document onto the typed `Frontmatter` shape. */
function toFrontmatter(doc: Document.Parsed): Frontmatter | null {
  const contents = doc.contents;
  if (!isMap(contents)) {
    return null;
  }

  // `toJS` collapses every node to a plain JS value, so the `extra` map carries
  // serializable data rather than `yaml` AST nodes with positional metadata.
  const plain: unknown = doc.toJS();
  const plainRecord = isRecord(plain) ? plain : {};

  const extra: Record<string, unknown> = {};
  let title = '';
  let recordType = '';
  let created = '';
  let updated = '';
  let tags: string[] = [];

  for (const item of contents.items) {
    if (!isPair(item) || !isScalar(item.key)) continue;
    const key = item.key.value;
    if (typeof key !== 'string') continue;

    switch (key) {
      case 'title':
        title = stringValue(item.value);
        break;
      case 'recordType':
        recordType = stringValue(item.value);
        break;
      case 'created':
        created = stringValue(item.value);
        break;
      case 'updated':
        updated = stringValue(item.value);
        break;
      case 'tags':
        tags = stringList(item.value);
        break;
      default:
        extra[key] = Object.hasOwn(plainRecord, key) ? plainRecord[key] : null;
    }
  }

  return { title, recordType, created, updated, tags, extra };
}

// endregion | Helpers
