import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveScopeChain } from '../scope-chain.ts';

describe(resolveScopeChain, () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = path.join(tmpdir(), `agents-test-scope-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(path.join(cwd, '.agents'), { recursive: true });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  /** Writes a file under `<cwd>/.agents/`. */
  async function writeAgentsFile(name: string): Promise<void> {
    await writeFile(path.join(cwd, '.agents', name), 'x', 'utf8');
  }

  const projectPath = (): string => path.join(cwd, '.agents', 'codeassembly.yaml');
  const localPath = (): string => path.join(cwd, '.agents', 'codeassembly.local.yaml');

  it('returns an empty list when no tier file exists', async () => {
    expect(await resolveScopeChain('codeassembly.yaml', { cwd })).toEqual([]);
  });

  it('returns an empty list when the .agents directory is absent', async () => {
    await rm(path.join(cwd, '.agents'), { recursive: true, force: true });
    expect(await resolveScopeChain('codeassembly.yaml', { cwd })).toEqual([]);
  });

  it('returns only the project file when only it exists', async () => {
    await writeAgentsFile('codeassembly.yaml');
    expect(await resolveScopeChain('codeassembly.yaml', { cwd })).toEqual([projectPath()]);
  });

  it('returns only the project-local file when only it exists', async () => {
    await writeAgentsFile('codeassembly.local.yaml');
    expect(await resolveScopeChain('codeassembly.yaml', { cwd })).toEqual([localPath()]);
  });

  it('returns both tiers ordered project then project-local (lowest to highest precedence)', async () => {
    await writeAgentsFile('codeassembly.yaml');
    await writeAgentsFile('codeassembly.local.yaml');
    expect(await resolveScopeChain('codeassembly.yaml', { cwd })).toEqual([projectPath(), localPath()]);
  });

  it('derives the .local variant from the filename before its extension', async () => {
    await writeAgentsFile('preferences.local.yaml');
    expect(await resolveScopeChain('preferences.yaml', { cwd })).toEqual([
      path.join(cwd, '.agents', 'preferences.local.yaml'),
    ]);
  });
});
