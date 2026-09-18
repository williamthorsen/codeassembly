import { ASSERTIONS_DIR } from '../layout/index.ts';

// How a note's path maps onto a domain path, defined once.
//
// The drift rules ask which domains a note set observes; back-fill asks which domains a note set implies. Both answers
// have to come from the same mapping, or a back-filled taxonomy would report drift against the notes from which it was
// derived.

/**
 * Derives every domain implied by a note set: each note's domain, plus each of that domain's ancestors, sorted.
 * A grouping domain that contains only subfolders is included, because the rules treat it as in use and would
 * otherwise report a back-filled taxonomy's own entries as unused.
 */
export function deriveDomains(relativePaths: Iterable<string>): string[] {
  const domains = new Set<string>();
  for (const relativePath of relativePaths) {
    let domain = resolveDomain(relativePath);
    while (domain !== undefined) {
      domains.add(domain);
      domain = resolveParent(domain);
    }
  }
  return domains.values().toArray().toSorted();
}

/**
 * Derives a note's domain, or `undefined` when the note is not an assertion or is at the assertions root.
 * Scoping to the assertions root keeps event records from registering as domains.
 */
export function resolveDomain(relativePath: string): string | undefined {
  const prefix = `${ASSERTIONS_DIR}/`;
  if (!relativePath.startsWith(prefix)) {
    return undefined;
  }
  return resolveParent(relativePath.slice(prefix.length));
}

/** Derives a slash-path's parent, or `undefined` when it has no separator and so is at the top level. */
export function resolveParent(path: string): string | undefined {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? undefined : path.slice(0, lastSlash);
}
