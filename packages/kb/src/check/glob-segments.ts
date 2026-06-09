// Slash-separated glob-segment helpers shared by note enumeration and CLI targeting.

/** Reports whether a path segment contains a glob metacharacter, making it non-literal. */
export function isGlobSegment(segment: string): boolean {
  return /[*?[\]{}()!+@]/.test(segment);
}

/**
 * Returns the leading run of literal (non-glob) segments of a slash-separated pattern, slash-joined. A pattern whose
 * first segment is a glob yields the empty string; a fully literal pattern yields itself. Locates the deepest concrete
 * path a glob is anchored to, e.g. `content/notes/**` yields `content/notes`.
 */
export function leadingLiteralPrefix(pattern: string): string {
  const literal: string[] = [];
  for (const segment of pattern.split('/')) {
    if (isGlobSegment(segment)) break;
    literal.push(segment);
  }
  return literal.join('/');
}
