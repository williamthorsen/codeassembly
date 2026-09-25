import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverWorkspaceDirs, mergeScopeDirs, resolveScopes, type ScopeDir } from '../resolve-scopes.ts';

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

describe(mergeScopeDirs, () => {
  it('names each package directory by its basename and keeps each declared name', () => {
    const scopeDirs = mergeScopeDirs({
      declaredDirs: [{ dir: '/repo/tools/ios-shell', name: 'ios' }],
      packageDirs: ['/repo/packages/kb'],
    });

    expect(scopeDirs).toEqual([
      { dir: '/repo/packages/kb', name: 'kb' },
      { dir: '/repo/tools/ios-shell', name: 'ios' },
    ]);
  });

  it('lets a declared directory that is also a package directory override the package’s name', () => {
    const scopeDirs = mergeScopeDirs({
      declaredDirs: [{ dir: '/repo/packages/kb', name: 'knowledge' }],
      packageDirs: ['/repo/packages/kb', '/repo/packages/agents'],
    });

    expect(scopeDirs).toEqual([
      { dir: '/repo/packages/kb', name: 'knowledge' },
      { dir: '/repo/packages/agents', name: 'agents' },
    ]);
  });
});

describe(resolveScopes, () => {
  const projectRoot = '/repo';
  const scopeDirs: ScopeDir[] = [
    { dir: '/repo/packages/agents', name: 'agents' },
    { dir: '/repo/packages/kb', name: 'kb' },
  ];

  it('resolves a path inside a scope directory to that directory’s name', () => {
    const resolution = resolveScopes({ paths: ['packages/kb/src/index.ts'], projectRoot, scopeDirs });

    expect(resolution.pathScopes).toEqual({ 'packages/kb/src/index.ts': 'kb' });
  });

  it('resolves the scope directory itself to its name', () => {
    const resolution = resolveScopes({ paths: ['packages/kb'], projectRoot, scopeDirs });

    expect(resolution.pathScopes).toEqual({ 'packages/kb': 'kb' });
  });

  it('resolves a path outside every scope directory to root', () => {
    const resolution = resolveScopes({ paths: ['AGENTS.md', 'packages/README.md'], projectRoot, scopeDirs });

    expect(resolution.pathScopes).toEqual({ 'AGENTS.md': 'root', 'packages/README.md': 'root' });
  });

  it('does not let a scope directory claim a sibling path sharing its prefix', () => {
    const resolution = resolveScopes({ paths: ['packages/kb-tools/x.ts'], projectRoot, scopeDirs });

    expect(resolution.pathScopes).toEqual({ 'packages/kb-tools/x.ts': 'root' });
  });

  it('resolves a path inside a nested scope directory to the inner one', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/plugins/tagger/src/index.ts'],
      projectRoot,
      scopeDirs: [...scopeDirs, { dir: '/repo/packages/kb/plugins/tagger', name: 'tagger' }],
    });

    expect(resolution.pathScopes).toEqual({ 'packages/kb/plugins/tagger/src/index.ts': 'tagger' });
  });

  it('reads an absolute path the same way as the root-relative one naming the same file', () => {
    const resolution = resolveScopes({
      paths: ['/repo/packages/agents/src/cli.ts', 'packages/agents/src/cli.ts'],
      projectRoot,
      scopeDirs,
    });

    expect(resolution.pathScopes).toEqual({
      '/repo/packages/agents/src/cli.ts': 'agents',
      'packages/agents/src/cli.ts': 'agents',
    });
  });

  it('resolves a path outside the project root to root', () => {
    const resolution = resolveScopes({ paths: ['../elsewhere/x.ts', '..'], projectRoot, scopeDirs });

    expect(resolution.pathScopes).toEqual({ '../elsewhere/x.ts': 'root', '..': 'root' });
  });

  it('resolves every path to root when there are no scope directories', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/src/index.ts', 'AGENTS.md'],
      projectRoot,
      scopeDirs: [],
    });

    expect(resolution).toEqual({
      pathScopes: { 'packages/kb/src/index.ts': 'root', 'AGENTS.md': 'root' },
      scopes: ['root'],
    });
  });

  it('resolves a declared directory nested in a package to the declared name', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/ios/App.swift', 'packages/kb/src/index.ts'],
      projectRoot,
      scopeDirs: [...scopeDirs, { dir: '/repo/packages/kb/ios', name: 'ios' }],
    });

    expect(resolution.pathScopes).toEqual({ 'packages/kb/ios/App.swift': 'ios', 'packages/kb/src/index.ts': 'kb' });
  });

  it('resolves a package nested in a declared directory to the package', () => {
    const resolution = resolveScopes({
      paths: ['apps/devopticon/Package.swift', 'apps/devopticon/web/src/main.ts'],
      projectRoot,
      scopeDirs: [
        { dir: '/repo/apps/devopticon', name: 'devopticon' },
        { dir: '/repo/apps/devopticon/web', name: 'web' },
      ],
    });

    expect(resolution.pathScopes).toEqual({
      'apps/devopticon/Package.swift': 'devopticon',
      'apps/devopticon/web/src/main.ts': 'web',
    });
  });

  it('reports the sorted unique set of the scopes that the paths name', () => {
    const resolution = resolveScopes({
      paths: ['packages/kb/a.ts', 'AGENTS.md', 'packages/agents/b.ts', 'packages/kb/c.ts'],
      projectRoot,
      scopeDirs,
    });

    expect(resolution.scopes).toEqual(['agents', 'kb', 'root']);
  });

  it('reports no scopes when given no paths', () => {
    expect(resolveScopes({ paths: [], projectRoot, scopeDirs })).toEqual({ pathScopes: {}, scopes: [] });
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
