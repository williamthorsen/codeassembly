import type { RunAcli } from './create-work-item.ts';

/** The site that `acli` is signed in to, the site that the work item belongs to, and whether they are the same. */
export interface SiteCheck {
  activeSite: string | null;
  match: boolean;
  targetSite: string;
}

/** Compares the site reported in `acli jira auth status` output with the host of `target`. */
export function compareSites(statusOutput: string, target: string): SiteCheck {
  const targetSite = normalizeSite(target);
  const activeSite = parseActiveSite(statusOutput);
  return { activeSite, match: activeSite === targetSite, targetSite };
}

/**
 * Returns the lowercase host of a ticket URL, a base URL, or a bare host, without its port. Throws when `target` is not
 * a URL or a host.
 */
export function normalizeSite(target: string): string {
  const trimmed = target.trim();
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  let hostname: string;
  try {
    hostname = new URL(candidate).hostname;
  } catch (error) {
    throw new Error(`not a URL or a host: '${target}'`, { cause: error });
  }
  if (hostname === '') {
    throw new Error(`not a URL or a host: '${target}'`);
  }
  return hostname.toLowerCase();
}

/** Reads the active site from `acli jira auth status` output, or null when the output does not name one. */
export function parseActiveSite(statusOutput: string): string | null {
  const site = /^\s*Site:\s*(\S+)\s*$/m.exec(statusOutput)?.[1];
  if (site === undefined) {
    return null;
  }
  try {
    return normalizeSite(site);
  } catch {
    return null;
  }
}

/** Runs `acli jira auth status` and compares its active site with `target`; a failed status call yields a null site. */
export async function readSiteCheck(target: string, runAcli: RunAcli): Promise<SiteCheck> {
  const targetSite = normalizeSite(target);
  const status = await runAcli(['jira', 'auth', 'status']);
  if (status.exitCode !== 0) {
    return { activeSite: null, match: false, targetSite };
  }
  return compareSites(status.stdout, targetSite);
}
