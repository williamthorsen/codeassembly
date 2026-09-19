/**
 * Reduction of an `owner/name` repo to the path segments under which machine-local state is partitioned by repo.
 *
 * Shared by every such store, so that a malformed remote resolves to one spelling rather than to a different one per
 * store.
 */

/** Path segment substituted for a repo half that does not resolve, so that a record is still written to a readable path. */
export const REPO_SEGMENT_PLACEHOLDER = '_no-repo';

/** Splits an `owner/name` repo into its two path segments, falling back to the placeholder for either half. */
export function splitRepo(repo: string | undefined): [owner: string, name: string] {
  const [owner, name] = (repo ?? '').split('/', 2);
  return [toSafeSegment(owner ?? '', REPO_SEGMENT_PLACEHOLDER), toSafeSegment(name ?? '', REPO_SEGMENT_PLACEHOLDER)];
}

/**
 * Reduces `value` to one path component: Separators are flattened to hyphens, and a value that names no directory
 * (empty, or dots only, which would traverse upward) is replaced by `placeholder`.
 */
export function toSafeSegment(value: string, placeholder: string): string {
  const flattened = value.trim().replaceAll(/[/\\]/g, '-');
  return flattened === '' || /^\.+$/.test(flattened) ? placeholder : flattened;
}
