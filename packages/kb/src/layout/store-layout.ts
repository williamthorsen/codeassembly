import { join } from 'node:path';

// The store's on-disk layout: where a knowledge base keeps its metadata and its content.
//
// Every constant here is a store-relative posix path. That single representation serves both filesystem callers and
// git callers: `join` rewrites forward slashes to the platform separator, while a git object spec
// (`<rev>:<path>`) requires posix separators on every platform. Holding the segments in an array instead would force
// each caller to re-derive its own string, which is how these paths came to be duplicated in the first place.

/** The store's metadata directory. Its presence marks a directory as a KB root. */
export const KB_DIR = '.kb';

/** The directory holding the store's notes. */
export const CONTENT_DIR = 'content';

/** The `content/` subdirectory holding assertion records. Named on its own because a caller may need to recognize the segment, not just the path. */
export const ASSERTIONS_SEGMENT = 'assertions';

/** The tag-alias map. */
export const ALIASES_FILE = `${KB_DIR}/tag-aliases.yaml`;

/** The directory holding the store's assertion records. */
export const ASSERTIONS_DIR = `${CONTENT_DIR}/${ASSERTIONS_SEGMENT}`;

/** The check configuration. */
export const CONFIG_FILE = `${KB_DIR}/config.yaml`;

/** The directory holding the store's event records. */
export const EVENTS_DIR = `${CONTENT_DIR}/events`;

/**
 * Builds an event record's store-relative path. Posix-separated, so it serves as the path half of a git object spec
 * (`@{upstream}:content/events/<id>.md`) as well as an argument to `join`.
 */
export function buildEventPath(id: string): string {
  return `${EVENTS_DIR}/${id}.md`;
}

/** Resolves the absolute path of a store's assertions directory. */
export function resolveAssertionsDir(storePath: string): string {
  return join(storePath, ASSERTIONS_DIR);
}

/** Resolves an event record's absolute path within a store. */
export function resolveEventPath(input: { storePath: string; id: string }): string {
  return join(input.storePath, buildEventPath(input.id));
}

/** Resolves the absolute path of a store's events directory. */
export function resolveEventsDir(storePath: string): string {
  return join(storePath, EVENTS_DIR);
}

/** Resolves the absolute path of a store's metadata directory. */
export function resolveKbDir(storePath: string): string {
  return join(storePath, KB_DIR);
}
