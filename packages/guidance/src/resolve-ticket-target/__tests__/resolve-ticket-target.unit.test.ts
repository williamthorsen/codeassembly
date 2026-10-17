import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type GhResult, type GhRunner, resolveTicketTarget } from '../resolve-ticket-target.ts';

const LABEL_MAP = '{"scopes":{"guidance":"scope:guidance"},"types":{"feat":"feature"}}';

const NOT_FOUND: GhResult = {
  exitCode: 1,
  stderr: 'gh: Not Found (HTTP 404)\n',
  stdout: '{"message":"Not Found","status":"404"}',
};

describe(resolveTicketTarget, () => {
  it('writes both files under the root at their repository paths and reads the slug and prefix from preferences', async () => {
    const preferences = "project:\n  slug: assembly\n  ticket_ref_prefix: '#'\n";
    const gh = makeGh({ '.agents/preferences.yaml': preferences, '.meta/label-map.json': LABEL_MAP });

    const target = await resolveTicketTarget({ gh, repo: 'Owner/Repo', tempRoot: await makeTempRoot() });

    expect(target).toMatchObject({ missing: [], projectSlug: 'assembly', repo: 'owner/repo', ticketRefPrefix: '#' });
    await expect(readFile(join(target.projectRoot, '.meta', 'label-map.json'), 'utf8')).resolves.toBe(LABEL_MAP);
    await expect(readFile(join(target.projectRoot, '.agents', 'preferences.yaml'), 'utf8')).resolves.toBe(preferences);
  });

  it('reports a missing label map and still reads the preferences', async () => {
    const gh = makeGh({ '.agents/preferences.yaml': 'repository:\n  slug: repo-slug\n' });

    const target = await resolveTicketTarget({ gh, repo: 'owner/repo', tempRoot: await makeTempRoot() });

    expect(target).toMatchObject({ missing: ['.meta/label-map.json'], projectSlug: 'repo-slug', ticketRefPrefix: '' });
  });

  it('reports missing preferences and falls back to the repository name for the slug', async () => {
    const gh = makeGh({ '.meta/label-map.json': LABEL_MAP });

    const target = await resolveTicketTarget({ gh, repo: 'owner/repo', tempRoot: await makeTempRoot() });

    expect(target).toMatchObject({ missing: ['.agents/preferences.yaml'], projectSlug: 'repo', ticketRefPrefix: '' });
  });

  it('refuses a repository that GitHub does not report', async () => {
    const gh: GhRunner = () => Promise.resolve(NOT_FOUND);

    await expect(resolveTicketTarget({ gh, repo: 'owner/absent', tempRoot: await makeTempRoot() })).rejects.toThrow(
      'repository owner/absent: not found, or not readable with the current gh credentials',
    );
  });

  it('refuses when a fetch fails for a reason other than a missing file', async () => {
    const gh: GhRunner = (args) =>
      Promise.resolve(
        args[1] === 'repos/owner/repo'
          ? { exitCode: 0, stderr: '', stdout: 'owner/repo\n' }
          : { exitCode: 1, stderr: 'gh: Bad credentials (HTTP 401)\n', stdout: '{"status":"401"}' },
      );

    await expect(resolveTicketTarget({ gh, repo: 'owner/repo', tempRoot: await makeTempRoot() })).rejects.toThrow(
      'owner/repo: .meta/label-map.json cannot be fetched: gh: Bad credentials (HTTP 401)',
    );
  });

  it.each(['owner', 'owner/repo/extra', 'https://github.com/owner/repo', 'owner/re po'])(
    'refuses %s without calling gh',
    async (repo) => {
      const calls: Array<readonly string[]> = [];
      const gh: GhRunner = (args) => {
        calls.push(args);
        return Promise.resolve(NOT_FOUND);
      };

      await expect(resolveTicketTarget({ gh, repo, tempRoot: await makeTempRoot() })).rejects.toThrow(
        `--repo takes OWNER/REPO; got ${repo}`,
      );
      expect(calls).toStrictEqual([]);
    },
  );
});

// region | Helpers

/**
 * Builds a `gh` runner that reports the repository as `owner/repo` and serves each file in `files` from the contents
 * API, returning 404 for every other path.
 */
function makeGh(files: Readonly<Record<string, string>>): GhRunner {
  return (args) => {
    const endpoint = args[1] ?? '';
    if (/^repos\/[^/]+\/[^/]+$/.test(endpoint)) {
      return Promise.resolve({ exitCode: 0, stderr: '', stdout: 'owner/repo\n' });
    }
    const file = endpoint.replace(/^repos\/owner\/repo\/contents\//, '');
    const content = files[file];
    return Promise.resolve(content === undefined ? NOT_FOUND : { exitCode: 0, stderr: '', stdout: content });
  };
}

/** Creates a directory under which the run creates its project root. */
async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'resolve-ticket-target-'));
}

// endregion | Helpers
