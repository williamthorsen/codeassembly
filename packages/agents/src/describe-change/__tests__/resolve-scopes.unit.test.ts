import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverWorkspaceDirs, resolveScopes } from '../resolve-scopes.ts';

describe(discoverWorkspaceDirs, () => {
  it('discovers the directories that the root declares as workspaces', async () => {
    const root = await writeWorkspaceRoot();

    expect(discoverWorkspaceDirs(root)).toEqual(fixtureDirs(root));
  });

  it('honors a negative pattern, which excludes a directory that an earlier pattern matched', async () => {
    const root = await writeWorkspaceRoot(["  - 'packages/*'", "  - '!packages/kb'"]);

    expect(discoverWorkspaceDirs(root)).toEqual([join(root, 'packages/agents')]);
  });

  it('discovers nothing when the root declares no pnpm workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'resolve-scopes-'));

    expect(discoverWorkspaceDirs(root)).toEqual([]);
  });

  it('discovers nothing when the declared patterns match no directory', async () => {
    const root = await writeWorkspaceRoot(["  - 'libs/*'"]);

    expect(discoverWorkspaceDirs(root)).toEqual([]);
  });
});

describe(resolveScopes, () => {
  const projectRoot = '/repo';
  const workspaceDirs = ['/repo/packages/agents', '/repo/packages/kb'];

  it('resolves a path inside a workspace to that directory’s basename', () => {
    const resolution = resolveScopes({ paths: ['packages/kb/src/index.ts'], projectRoot, workspaceDirs });

    expect(resolution.pathScopes).toEqual({ 'packages/kb/src/index.ts': 'kb' });
  });

  it('resolves the workspace directory itself to its basename', () => {
    const resolution = resolveScopes({ paths: ['packages/kb'], projectRoot, workspaceDirs });

    expect(resolution.pathScopes).toEqual({ 'packages/kb': 'kb' });
  });

  it('resolves a path outside every workspace to root', () => {
    const resolution = resolveScopes({ paths: ['AGENTS.md', 'packages/README.md'], projectRoot, workspaceDirs });

    expect(resolution.pathScopes).toEqual({ 'AGENTS.md': 'root', 'packages/README.md': 'root' });
  });

  it('does not let a workspace claim a sibling path sharing its prefix', () => {
    const resolution = resolveScopes({ paths: ['packages/kb-tools/x.ts'], projectRoot, workspaceDirs });

    expect(resolution.pathScopes).toEqual({ 'packages/kb-tools/x.ts': 'root' });
  });

  it('resolves a path inside a nested workspace to the inner one', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/plugins/tagger/src/index.ts'],
      projectRoot,
      workspaceDirs: [...workspaceDirs, '/repo/packages/kb/plugins/tagger'],
    });

    expect(resolution.pathScopes).toEqual({ 'packages/kb/plugins/tagger/src/index.ts': 'tagger' });
  });

  it('reads an absolute path the same way as the root-relative one naming the same file', () => {
    const resolution = resolveScopes({
      paths: ['/repo/packages/agents/src/cli.ts', 'packages/agents/src/cli.ts'],
      projectRoot,
      workspaceDirs,
    });

    expect(resolution.pathScopes).toEqual({
      '/repo/packages/agents/src/cli.ts': 'agents',
      'packages/agents/src/cli.ts': 'agents',
    });
  });

  it('resolves a path outside the project root to root', () => {
    const resolution = resolveScopes({ paths: ['../elsewhere/x.ts', '..'], projectRoot, workspaceDirs });

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
      workspaceDirs,
    });

    expect(resolution.scopes).toEqual(['agents', 'kb', 'root']);
  });

  it('reports no scopes when given no paths', () => {
    expect(resolveScopes({ paths: [], projectRoot, workspaceDirs })).toEqual({ pathScopes: {}, scopes: [] });
  });
});

// region | Helpers

/** The workspace directories of a fixture root, as absolute paths under it. */
function fixtureDirs(root: string): string[] {
  return [join(root, 'packages/agents'), join(root, 'packages/kb')];
}

/** Writes a fixture root declaring the given workspace patterns, with `packages/agents` and `packages/kb` holding a manifest. */
async function writeWorkspaceRoot(patterns: readonly string[] = ["  - 'packages/*'"]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'resolve-scopes-'));
  for (const dir of ['packages/agents', 'packages/kb']) {
    await mkdir(join(root, dir), { recursive: true });
    await writeFile(join(root, dir, 'package.json'), '{}', 'utf8');
  }
  await writeFile(join(root, 'pnpm-workspace.yaml'), `packages:\n${patterns.join('\n')}\n`, 'utf8');
  return root;
}

// endregion | Helpers
