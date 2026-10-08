import { readFile } from 'node:fs/promises';

import {
  CANONICAL_TAXONOMY,
  type CanonicalTaxonomy,
  type CanonicalWorkTypeEntry,
} from '@williamthorsen/change-grammar';

import { isMissingFile } from './type-guards.ts';

/** One work type as the deployed `work-types.json` declares it. */
export type WorkTypesDocumentEntry = Omit<CanonicalWorkTypeEntry, 'trackerLabel'>;

/** The deployed `work-types.json`: the canonical taxonomy without the tracker labels, which only the label map reads. */
export interface WorkTypesDocument extends Omit<CanonicalTaxonomy, 'types'> {
  types: readonly WorkTypesDocumentEntry[];
}

/** Whether a committed `work-types.json` matches what the build writes. */
export type WorkTypesFileState = 'current' | 'missing' | 'stale';

/** Projects the taxonomy into the deployed document, dropping each type's `trackerLabel` and keeping key order. */
export function buildWorkTypesDocument(taxonomy: CanonicalTaxonomy = CANONICAL_TAXONOMY): WorkTypesDocument {
  return {
    ...taxonomy,
    types: taxonomy.types.map(({ trackerLabel: _trackerLabel, ...entry }) => entry),
  };
}

/** Compares the file at `filePath` byte for byte with the serialized document that the build writes. */
export async function checkWorkTypesFile(
  filePath: string,
  document: WorkTypesDocument = buildWorkTypesDocument(),
): Promise<WorkTypesFileState> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return 'missing';
    }
    throw error;
  }
  return content === serializeWorkTypesDocument(document) ? 'current' : 'stale';
}

/** Serializes the document as the build writes it: two-space JSON with a trailing newline. */
export function serializeWorkTypesDocument(document: WorkTypesDocument): string {
  return JSON.stringify(document, undefined, 2) + '\n';
}
