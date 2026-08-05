import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'yaml';

import { KbLoaderError } from '../config/kb-loader-error.ts';
import { TAXONOMY_FILE } from '../layout/index.ts';
import { isEnoent } from '../type-guards.ts';
import type { KbRoot } from '../types.ts';
import { describeKeyDefect, type Taxonomy, type TaxonomyEntry, taxonomyFileShape } from './taxonomy-schema.ts';

/**
 * Loads `.kb/taxonomy.yaml` into a single keyed map, returning an empty taxonomy when the file is absent or declares
 * nothing. The two on-disk blocks are a file-format concern: a consumer looks a domain up once and reads `provisional`
 * off the entry it finds.
 *
 * Mirrors {@link loadKbConfig}: structural defects (malformed YAML, a wrong type, a malformed key, a path declared in
 * both blocks) throw a {@link KbLoaderError} naming the file. I/O errors other than a missing file propagate.
 */
export async function loadTaxonomy(input: { kbRoot: KbRoot }): Promise<Taxonomy> {
  const path = join(input.kbRoot.path, TAXONOMY_FILE);

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return new Map();
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new KbLoaderError(`${path}: malformed YAML — ${message}`);
  }

  // A comment-only file parses to null, which is a taxonomy declaring nothing rather than a defect.
  const result = taxonomyFileShape.safeParse(parsed ?? {});
  if (!result.success) {
    throw new KbLoaderError(`${path}: invalid taxonomy.yaml — ${result.error.issues[0]?.message ?? 'unknown error'}`);
  }

  const entries = new Map<string, TaxonomyEntry>();
  collectBlock({ entries, block: result.data.domains, provisional: false, path });
  collectBlock({ entries, block: result.data.provisional, provisional: true, path });
  return entries;
}

// region | Helpers

/**
 * Adds one on-disk block's declarations to the accumulating map, rejecting a malformed key and a path the other block
 * already declared. Called for `domains` first, so a collision always names a path `provisional` redeclares.
 */
function collectBlock(input: {
  entries: Map<string, TaxonomyEntry>;
  block: Record<string, string | null> | undefined;
  provisional: boolean;
  path: string;
}): void {
  const { entries, block, provisional, path } = input;
  if (block === undefined) {
    return;
  }

  for (const [key, description] of Object.entries(block)) {
    const defect = describeKeyDefect(key);
    if (defect !== undefined) {
      throw new KbLoaderError(`${path}: domain "${key}" ${defect}`);
    }
    if (entries.has(key)) {
      throw new KbLoaderError(`${path}: domain "${key}" is declared in both domains and provisional`);
    }
    entries.set(key, { description: description ?? '', provisional });
  }
}

// endregion | Helpers
