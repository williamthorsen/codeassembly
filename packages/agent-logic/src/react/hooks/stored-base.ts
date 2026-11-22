/** Returns a file name without its last extension when a base precedes it, or the name itself. */
export function dropLastExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Replaces each run of characters that a stored name does not take with `-`, and trims leading dots and dashes; a base
 * of which none of its characters remains becomes the fallback.
 */
export function sanitizeStoredBase(base: string, fallback: string): string {
  const sanitized = base.replaceAll(/[^\w.-]+/g, '-').replace(/^[.-]+/, '');
  return sanitized === '' ? fallback : sanitized;
}
