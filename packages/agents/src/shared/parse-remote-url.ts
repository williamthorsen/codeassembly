/** Git-remote URL parsing, shared across skill modules. */

/**
 * Parses a git remote URL (SSH or HTTPS) into its `owner/repo` — the last two path segments — or
 * null when it cannot be parsed. The `.git` suffix is stripped, and a path carrying extra leading
 * segments (e.g. a GitLab subgroup) is reduced to its final two.
 */
export function parseRemoteToOwnerRepo(url: string): string | null {
  const withoutSuffix = url.replace(/\.git$/, '');
  const sshMatch = /^[^@]+@[^:]+:(?<path>.+)$/.exec(withoutSuffix);
  if (sshMatch?.groups?.path !== undefined) {
    return takeOwnerRepo(sshMatch.groups.path);
  }
  const httpsMatch = /^https?:\/\/[^/]+\/(?<path>.+)$/.exec(withoutSuffix);
  if (httpsMatch?.groups?.path !== undefined) {
    return takeOwnerRepo(httpsMatch.groups.path);
  }
  return null;
}

/** Reduces a remote path (which may carry extra leading subgroups) to its last two `owner/repo` segments. */
function takeOwnerRepo(remotePath: string): string | null {
  const segments = remotePath.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return null;
  }
  return segments.slice(-2).join('/');
}
