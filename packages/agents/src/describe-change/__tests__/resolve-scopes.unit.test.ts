import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverWorkspaceDirs, resolveScopes } from '../resolve-scopes.ts';

/** The workspace directories of a fixture root declaring `packages/*`. */
const FIXTURE_DIRS = ['packages/agents', 'packages/kb'];

describe(discoverWorkspaceDirs, () => {
  it('keeps the glob matches holding a package.json, in sorted order', async () => {
    const root = await writeFixtureRoot({
      dirs: [...FIXTURE_DIRS, 'packages/scripts'],
      manifests: FIXTURE_DIRS,
      patterns: ['packages/*'],
    });

    expect(await discoverWorkspaceDirs(root)).toEqual(FIXTURE_DIRS);
  });

  it('resolves every declared pattern, reporting a directory matched by two of them once', async () => {
    const root = await writeFixtureRoot({
      dirs: FIXTURE_DIRS,
      manifests: FIXTURE_DIRS,
      patterns: ['packages/*', 'packages/kb'],
    });

    expect(await discoverWorkspaceDirs(root)).toEqual(FIXTURE_DIRS);
  });

  it('discovers nothing when the root declares no workspace file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'resolve-scopes-'));

    expect(await discoverWorkspaceDirs(root)).toEqual([]);
  });

  it('discovers nothing when the workspace file declares no packages list', async () => {
    const root = await writeFixtureRoot({ dirs: FIXTURE_DIRS, manifests: FIXTURE_DIRS, patterns: undefined });

    expect(await discoverWorkspaceDirs(root)).toEqual([]);
  });

  it('discovers nothing when the declared patterns resolve to nothing', async () => {
    const root = await writeFixtureRoot({ dirs: FIXTURE_DIRS, manifests: FIXTURE_DIRS, patterns: ['libs/*'] });

    expect(await discoverWorkspaceDirs(root)).toEqual([]);
  });
});

describe(resolveScopes, () => {
  const projectRoot = '/repo';

  it('resolves a path inside a workspace to that directory’s basename', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/src/index.ts'],
      projectRoot,
      workspaceDirs: FIXTURE_DIRS,
    });

    expect(resolution.pathScopes).toEqual({ 'packages/kb/src/index.ts': 'kb' });
  });

  it('resolves the workspace directory itself to its basename', () => {
    const resolution = resolveScopes({ paths: ['packages/kb'], projectRoot, workspaceDirs: FIXTURE_DIRS });

    expect(resolution.pathScopes).toEqual({ 'packages/kb': 'kb' });
  });

  it('resolves a path outside every workspace to root', () => {
    const resolution = resolveScopes({
      paths: ['AGENTS.md', 'packages/README.md'],
      projectRoot,
      workspaceDirs: FIXTURE_DIRS,
    });

    expect(resolution.pathScopes).toEqual({ 'AGENTS.md': 'root', 'packages/README.md': 'root' });
  });

  it('does not let a workspace claim a sibling path sharing its prefix', () => {
    const resolution = resolveScopes({ paths: ['packages/kb-tools/x.ts'], projectRoot, workspaceDirs: FIXTURE_DIRS });

    expect(resolution.pathScopes).toEqual({ 'packages/kb-tools/x.ts': 'root' });
  });

  it('resolves a path inside a nested workspace to the inner one', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/plugins/tagger/src/index.ts'],
      projectRoot,
      workspaceDirs: [...FIXTURE_DIRS, 'packages/kb/plugins/tagger'],
    });

    expect(resolution.pathScopes).toEqual({ 'packages/kb/plugins/tagger/src/index.ts': 'tagger' });
  });

  it('reads an absolute path relative to the project root', () => {
    const resolution = resolveScopes({
      paths: ['/repo/packages/agents/src/cli.ts'],
      projectRoot,
      workspaceDirs: FIXTURE_DIRS,
    });

    expect(resolution.pathScopes).toEqual({ '/repo/packages/agents/src/cli.ts': 'agents' });
  });

  it('resolves a path outside the project root to root', () => {
    const resolution = resolveScopes({ paths: ['../elsewhere/x.ts', '..'], projectRoot, workspaceDirs: FIXTURE_DIRS });

    expect(resolution.pathScopes).toEqual({ '../elsewhere/x.ts': 'root', '..': 'root' });
  });

  it('resolves every path to root when the root declares no workspaces', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/src/index.ts', 'AGENTS.md'],
      projectRoot,
      workspaceDirs: [],
    });

    expect(resolution).toEqual({
      pathScopes: { 'packages/kb/src/index.ts': 'root', 'AGENTS.md': 'root' },
      scopes: ['root'],
    });
  });

  it('reports the sorted unique set of the scopes that the paths name', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/a.ts', 'AGENTS.md', 'packages/agents/b.ts', 'packages/kb/c.ts'],
      projectRoot,
      workspaceDirs: FIXTURE_DIRS,
    });

    expect(resolution.scopes).toEqual(['agents', 'kb', 'root']);
  });

  it('reports no scopes when given no paths', () => {
    expect(resolveScopes({ paths: [], projectRoot, workspaceDirs: FIXTURE_DIRS })).toEqual({
      pathScopes: {},
      scopes: [],
    });
  });
});

// region | Helpers

/** Writes a fixture root with the given directories, a `package.json` in each named manifest, and a workspace file. */
async function writeFixtureRoot(fixture: {
  dirs: readonly string[];
  manifests: readonly string[];
  patterns: readonly string[] | undefined;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'resolve-scopes-'));
  for (const dir of fixture.dirs) {
    await mkdir(join(root, dir), { recursive: true });
  }
  for (const dir of fixture.manifests) {
    await writeFile(join(root, dir, 'package.json'), '{}', 'utf8');
  }
  const declaration = fixture.patterns === undefined ? 'catalog: {}' : `packages:\n${indentList(fixture.patterns)}`;
  await writeFile(join(root, 'pnpm-workspace.yaml'), `${declaration}\n`, 'utf8');
  return root;
}

/** Renders patterns as a YAML block sequence. */
function indentList(patterns: readonly string[]): string {
  return patterns.map((pattern) => `  - '${pattern}'`).join('\n');
}

// endregion | Helpers
