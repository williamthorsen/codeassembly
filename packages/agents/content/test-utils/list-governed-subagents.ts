import { readdirSync } from 'node:fs';

const SUBAGENTS_DIR = new URL('../subagents/', import.meta.url).pathname;

/** Subagents that neither compose prose nor read code, so no guidance bound by the library governs their work. */
const EXEMPT_SUBAGENTS: ReadonlySet<string> = new Set([
  // Exercises the declared-subagent deployment mechanism and is never invoked.
  'canary',
]);

/**
 * Returns every subagent slug that the guidance library can govern, read from the directory so that one added later
 * is covered the day it appears. The reach tests derive their populations from this rather than from the declarations
 * under test: A list read from the directives would move with the bug, whereas the directory is independent of them.
 */
export function listGovernedSubagents(): ReadonlyArray<string> {
  return readdirSync(SUBAGENTS_DIR)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.replace(/\.md$/, ''))
    .filter((slug) => !EXEMPT_SUBAGENTS.has(slug))
    .toSorted();
}
