import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readProjectPreferences } from '../derive-session-context/read-preferences.ts';
import { isRecord } from '../lib/type-guards.ts';

/**
 * Fetches the configuration against which a ticket filed in `repo` resolves, from the repository's default branch,
 * into a new directory under `tempRoot` that mirrors each file's repository path. Reports the directory, the slug and
 * the reference prefix that the repository's own preferences file declares, and each configuration file that the
 * default branch does not contain.
 *
 * Throws when `repo` is not in `OWNER/REPO` form, when GitHub does not report the repository, and when a fetch fails for
 * any reason other than a file that is not found.
 */
export async function resolveTicketTarget(input: {
  gh: GhRunner;
  repo: string;
  tempRoot: string;
}): Promise<TicketTarget> {
  const { gh, repo, tempRoot } = input;
  if (!REPO_PATTERN.test(repo)) {
    throw new Error(`--repo takes OWNER/REPO; got ${repo}`);
  }

  const lookup = await gh(['api', `repos/${repo}`, '--jq', '.full_name']);
  if (lookup.exitCode !== 0) {
    const reason = isNotFound(lookup)
      ? 'not found, or not readable with the current gh credentials'
      : describeFailure(lookup);
    throw new Error(`repository ${repo}: ${reason}`);
  }
  const fullName = lookup.stdout.trim();

  const projectRoot = await mkdtemp(path.join(tempRoot, 'ticket-target-'));
  const missing: string[] = [];
  for (const file of CONFIG_FILES) {
    const result = await gh([
      'api',
      `repos/${fullName}/contents/${file}`,
      '--header',
      'Accept: application/vnd.github.raw',
    ]);
    if (result.exitCode === 0) {
      const destination = path.join(projectRoot, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, result.stdout, 'utf8');
    } else if (isNotFound(result)) {
      missing.push(file);
    } else {
      throw new Error(`${fullName}: ${file} cannot be fetched: ${describeFailure(result)}`);
    }
  }

  const preferences = await readProjectPreferences(projectRoot);
  const repoName = fullName.slice(fullName.indexOf('/') + 1);
  return {
    missing,
    projectRoot,
    projectSlug:
      readString(preferences, 'project', 'slug') ?? readString(preferences, 'repository', 'slug') ?? repoName,
    repo: fullName,
    ticketRefPrefix: readString(preferences, 'project', 'ticket_ref_prefix') ?? '',
  };
}

/** Runs `gh` with the given arguments and reports its exit code and output. */
export type GhRunner = (args: readonly string[]) => Promise<GhResult>;

/** What one `gh` run reports. */
export interface GhResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** The configuration against which a ticket in another repository resolves. */
export interface TicketTarget {
  /** Each configuration file, by repository path, that the default branch does not contain. */
  missing: string[];
  projectRoot: string;
  projectSlug: string;
  /** The repository's canonical `OWNER/REPO`, as GitHub reports it. */
  repo: string;
  ticketRefPrefix: string;
}

// region | Helpers

/** The configuration files that `describe-change` and `create-ticket` read, by repository path. */
const CONFIG_FILES = ['.meta/label-map.json', '.agents/preferences.yaml'] as const;

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/** Describes a failed run by its stderr, falling back to its exit code. */
function describeFailure(result: GhResult): string {
  const stderr = result.stderr.trim();
  return stderr === '' ? `gh exited ${result.exitCode}` : stderr;
}

/** Reports whether a failed `gh api` run is GitHub's 404, which `gh` prints to stdout as a JSON body. */
function isNotFound(result: GhResult): boolean {
  if (result.exitCode === 0) {
    return false;
  }
  try {
    const body: unknown = JSON.parse(result.stdout);
    return isRecord(body) && body['status'] === '404';
  } catch {
    return false;
  }
}

/** Reads a string at `section.key` of the preferences, absent when either level is missing or not of that shape. */
function readString(preferences: Record<string, unknown>, section: string, key: string): string | undefined {
  const value = preferences[section];
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

// endregion | Helpers
