/** The hash of a file's extracted prose, which decides whether the file has changed since the sweep that covered it. */
import { createHash } from 'node:crypto';

import type { ProseSpan, ScannedFile } from './types.ts';

/** Number of hex characters kept from the digest: 64 bits, ample for telling one version of a file from another. */
const HASH_LENGTH = 16;

/**
 * Hashes each scanned file's prose, its spans in the order that the sweep yielded them. A scanned file without spans
 * gets the hash of an empty span list, so that prose added to it later changes its hash.
 */
export function hashFileProse(
  spans: readonly ProseSpan[],
  scannedFiles: readonly ScannedFile[],
): ReadonlyMap<string, string> {
  const texts = new Map<string, string[]>(scannedFiles.map((scanned) => [scanned.file, []]));
  for (const span of spans) texts.get(span.file)?.push(span.text);

  return new Map(
    [...texts].map(([file, fileTexts]) => [
      file,
      // Serialize the list rather than join it, so that a span boundary cannot be confused with a newline inside a span.
      createHash('sha256').update(JSON.stringify(fileTexts)).digest('hex').slice(0, HASH_LENGTH),
    ]),
  );
}
