import { type Document, isMap, isPair, isScalar, type Pair, type Scalar } from 'yaml';

import type { FrontmatterRaw } from '../types.ts';

// Internal bridge between the `yaml` package's CST/Document API and source line
// numbers. The rules layer reports findings against note line numbers; the
// `yaml` package reports offsets into the raw frontmatter slice. Keeping the
// `Document.Parsed` and these translators here means rules never need to know
// about `yaml` internals.

/**
 * The raw `yaml.Document` for a note's frontmatter, paired with the slice
 * metadata needed to map node offsets onto source line numbers. Produced by
 * `parseNote` and consumed by the rules layer; not part of the public API.
 */
export interface FrontmatterDocument {
  doc: Document.Parsed;
  raw: FrontmatterRaw;
}

/** Find a top-level mapping pair by string key; returns `null` when absent. */
export function findPair(doc: Document.Parsed, key: string): Pair | null {
  const contents = doc.contents;
  if (!isMap(contents)) return null;
  for (const item of contents.items) {
    if (isPair(item) && isScalar(item.key) && item.key.value === key) {
      return item;
    }
  }
  return null;
}

/** Translate a YAML node offset (into the raw frontmatter slice) to a 1-based note line number. */
export function noteLineOf(offset: number, raw: FrontmatterRaw): number {
  let line = 0;
  for (let index = 0; index < offset && index < raw.text.length; index += 1) {
    if (raw.text[index] === '\n') line += 1;
  }
  return raw.startLine + 1 + line;
}

/**
 * Source line of a pair's value. Falls back to the key's line when the value
 * range is missing (empty values) and to the line after the opening fence
 * when neither range is available.
 */
export function valueLine(pair: Pair, raw: FrontmatterRaw): number {
  if (isScalar(pair.value) && pair.value.range) {
    return noteLineOf(pair.value.range[0], raw);
  }
  if (isScalar(pair.key) && pair.key.range) {
    return noteLineOf(pair.key.range[0], raw);
  }
  return raw.startLine + 1;
}

/** Source line of a sequence item, falling back to the supplied line when the item has no range. */
export function itemLine(item: Scalar, raw: FrontmatterRaw, fallbackLine: number): number {
  if (item.range) {
    return noteLineOf(item.range[0], raw);
  }
  return fallbackLine;
}
