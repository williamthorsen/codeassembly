import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { RenderedTree } from 'codeassembly/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../../test-utils/content-root.ts';
import { renderLibrary } from '../../test-utils/rendered-library.ts';

// The harness home is written from `renderContentRoot`, which places support entries where `sync` deploys them, so a
// change to that layout reaches this suite. The script is placed as `install` places it, beside `skills/` in
// `scripts/`.

/** The script as authored, which `install` copies or links into the harness home verbatim. */
const SCRIPT_SOURCE = path.join(CONTENT_ROOT, 'scripts', 'resolve-frontmatter.sh');

/** A branch name from which the deriver reads `MAC-999` as the ticket ID. */
const FIXTURE_BRANCH = 'MAC-999/feat/fixture';

const HELPER_SUFFIX = '/derive-session-context/derive-session-context.mjs';

const tempDirs: Array<string> = [];

describe('resolve-frontmatter.sh in the installed layout', () => {
  let tree: RenderedTree;

  beforeAll(async () => {
    tree = await renderLibrary('claude');
  });

  afterAll(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it.each(['copy', 'symlink'] as const)('runs the deployed helper when installed as a %s', async (mode) => {
    const harnessHome = await writeHarnessHome(tree);
    const scriptPath = await installScript(harnessHome, mode);

    const result = await runScript(scriptPath);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ticket_id: 'MAC-999' });
  });

  it('fails and names every match when two sources deploy the helper', async () => {
    const harnessHome = await writeHarnessHome(tree);
    const secondHelper = path.join(harnessHome, 'skills', '_sources', 'second-source', HELPER_SUFFIX);
    await mkdir(path.dirname(secondHelper), { recursive: true });
    await writeFile(secondHelper, readHelperContent(tree));
    const scriptPath = await installScript(harnessHome, 'copy');

    const result = await runScript(scriptPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('several deployed derivers match');
    expect(result.stderr).toContain(secondHelper);
    expect(result.stderr).toContain('RESOLVE_FRONTMATTER_BUNDLE_PATH');
  });

  it('fails and names the searched path when no source deploys the helper', async () => {
    const harnessHome = await makeTempDir('harness-');
    const scriptPath = await installScript(harnessHome, 'copy');

    const result = await runScript(scriptPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`skills/_sources/*${HELPER_SUFFIX}`);
    expect(result.stderr).toContain('RESOLVE_FRONTMATTER_BUNDLE_PATH');
  });
});

// region | Helpers

/** Places the script in the harness home's `scripts/` as a copy or as a symlink to its source, as `install` does. */
async function installScript(harnessHome: string, mode: 'copy' | 'symlink'): Promise<string> {
  const scriptPath = path.join(harnessHome, 'scripts', 'resolve-frontmatter.sh');
  await mkdir(path.dirname(scriptPath), { recursive: true });
  if (mode === 'copy') {
    await copyFile(SCRIPT_SOURCE, scriptPath);
    await chmod(scriptPath, 0o755);
  } else {
    await symlink(SCRIPT_SOURCE, scriptPath);
  }
  return scriptPath;
}

/** Creates a temporary directory that the suite removes once it finishes. */
async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `resolve-frontmatter-${prefix}`));
  tempDirs.push(dir);
  return dir;
}

/** Returns the content of the helper as the rendered tree deploys it. */
function readHelperContent(tree: RenderedTree): string {
  const found = Object.entries(tree).find(([filePath]) => filePath.endsWith(HELPER_SUFFIX));
  if (found === undefined) {
    throw new Error(`the rendered tree does not contain a file ending in ${HELPER_SUFFIX}`);
  }
  return found[1].content;
}

/**
 * Runs the installed script from a fresh repository on the fixture branch, with the bundle-path override unset. The
 * deriver reads its global preferences from the repository through `--home`, not from the real home directory.
 */
async function runScript(scriptPath: string): Promise<{ status: number | null; stderr: string; stdout: string }> {
  const repo = await makeTempDir('repo-');
  spawnSync('git', ['init', '--quiet', `--initial-branch=${FIXTURE_BRANCH}`], { cwd: repo });
  spawnSync(
    'git',
    [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '--allow-empty',
      '--quiet',
      '--message=initial',
    ],
    { cwd: repo },
  );
  await mkdir(path.join(repo, '.agents'));
  await writeFile(path.join(repo, '.agents', 'preferences.yaml'), 'project:\n  slug: fixture-project\n');

  const { RESOLVE_FRONTMATTER_BUNDLE_PATH: _override, ...inherited } = process.env;
  const env = { ...inherited, RESOLVE_FRONTMATTER_BUNDLE_ARGS: `--home ${repo}` };
  const result = spawnSync(scriptPath, ['--format', 'json'], { cwd: repo, encoding: 'utf8', env });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

/** Writes every file of the rendered tree into a new harness home and returns its path. */
async function writeHarnessHome(tree: RenderedTree): Promise<string> {
  const harnessHome = await makeTempDir('harness-');
  for (const [filePath, entry] of Object.entries(tree)) {
    const destination = path.join(harnessHome, filePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, entry.content);
  }
  return harnessHome;
}

// endregion | Helpers
