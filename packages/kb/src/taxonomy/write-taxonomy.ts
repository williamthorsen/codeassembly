import { randomBytes } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Document, isMap, parseDocument } from 'yaml';

import { KbLoaderError } from '../config/kb-loader-error.ts';
import { TAXONOMY_FILE } from '../layout/index.ts';
import { isEnoent, isRecord } from '../type-guards.ts';
import type { KbRoot } from '../types.ts';
import { describeKeyDefect } from './taxonomy-schema.ts';

/** A domain to declare. */
export interface TaxonomyDeclaration {
  /** The domain's assertions-root-relative slash-path. */
  path: string;
  /** The one-line description; absent or empty writes the key bare, with no description. */
  description?: string;
  /** Whether to declare under `provisional:` rather than `domains:`. */
  provisional: boolean;
}

/**
 * Declares domains in `.kb/taxonomy.yaml`, creating the file and either block as needed, and returns the paths added.
 *
 * Edits the parsed document rather than re-serializing a plain object, so existing comments, key order, and formatting
 * survive; a plain parse-and-stringify round trip would discard every comment in a hand-curated file. New keys append
 * to the end of their block in path order.
 *
 * A path either block already declares is skipped rather than overwritten, so a repeat call adds nothing; when nothing
 * is left to add, the file is not opened for writing at all. The write is atomic (temp file plus rename, matching
 * `note-io`), so an interrupted call cannot truncate the taxonomy.
 *
 * Throws a {@link KbLoaderError} on a malformed key, or on an existing file that cannot be safely appended to. Other
 * I/O errors propagate.
 */
export async function writeTaxonomy(input: {
  kbRoot: KbRoot;
  declarations: readonly TaxonomyDeclaration[];
}): Promise<{ added: string[] }> {
  const path = join(input.kbRoot.path, TAXONOMY_FILE);

  // Validate every key before opening the file, so a bad batch cannot write half of itself.
  for (const declaration of input.declarations) {
    const defect = describeKeyDefect(declaration.path);
    if (defect !== undefined) {
      throw new KbLoaderError(`${path}: domain "${declaration.path}" ${defect}`);
    }
  }

  const document = await readDocument(path);
  const declared = readDeclaredPaths(document);

  const added: string[] = [];
  for (const declaration of sortByPath(input.declarations)) {
    if (declared.has(declaration.path)) {
      continue;
    }
    const description = declaration.description ?? '';
    const block = declaration.provisional ? 'provisional' : 'domains';
    document.setIn([block, declaration.path], description === '' ? null : description);
    declared.add(declaration.path);
    added.push(declaration.path);
  }

  if (added.length === 0) {
    return { added };
  }

  // `nullStr` renders a description-less domain as a bare `engineering/tooling:` rather than an explicit `null`, which
  // is what a hand editor writes and what keeps a back-filled file readable.
  await writeAtomic(path, document.toString({ nullStr: '' }));
  return { added };
}

// region | Helpers

/**
 * Reads the taxonomy into an editable document, treating an absent file as an empty one. Refuses a file this cannot
 * safely append to: rewriting a file with a parse error would discard whatever the parser could not read, and a
 * non-mapping top level has no block to append to.
 */
async function readDocument(path: string): Promise<Document> {
  let text = '';
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }

  const document = parseDocument(text);
  const firstError = document.errors[0];
  if (firstError !== undefined) {
    throw new KbLoaderError(`${path}: malformed YAML — ${firstError.message}`);
  }
  if (document.contents !== null && !isMap(document.contents)) {
    throw new KbLoaderError(`${path}: top-level must be a mapping`);
  }
  return document;
}

/** Collects the paths both blocks already declare, so an existing declaration is skipped rather than overwritten. */
function readDeclaredPaths(document: Document): Set<string> {
  const paths = new Set<string>();
  const contents: unknown = document.toJS();
  if (!isRecord(contents)) {
    return paths;
  }

  for (const block of ['domains', 'provisional']) {
    const declarations = contents[block];
    if (isRecord(declarations)) {
      for (const path of Object.keys(declarations)) {
        paths.add(path);
      }
    }
  }
  return paths;
}

/** Orders a batch by path, so appended keys read alphabetically rather than in call order. */
function sortByPath(declarations: readonly TaxonomyDeclaration[]): TaxonomyDeclaration[] {
  return declarations.toSorted((a, b) => {
    if (a.path === b.path) return 0;
    return a.path < b.path ? -1 : 1;
  });
}

/** Writes `content` to `path` via a same-directory temp file plus rename, so a reader never sees a partial write. */
async function writeAtomic(path: string, content: string): Promise<void> {
  const tempPath = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  try {
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

// endregion | Helpers
