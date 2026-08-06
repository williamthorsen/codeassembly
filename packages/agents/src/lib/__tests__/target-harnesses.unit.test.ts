import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveTargetHarnesses } from '../target-harnesses.ts';

describe(resolveTargetHarnesses, () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cwd = path.join(tmpdir(), `agents-test-th-proj-${stamp}`);
    homeDir = path.join(tmpdir(), `agents-test-th-home-${stamp}`);
    await mkdir(path.join(cwd, '.agents'), { recursive: true });
    await mkdir(path.join(homeDir, '.agents'), { recursive: true });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  it('returns the flag value without reading any declaration', async () => {
    await writeHome('harnesses:\n  use:\n    - rovo\n');

    expect(await resolveTargetHarnesses({ harness: 'claude', cwd, homeDir })).toEqual({
      harnessIds: ['claude'],
      origin: 'flag',
    });
  });

  it('falls back to the harnesses installed under the home directory', async () => {
    await installHarness('claude');
    await installHarness('rovo');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toEqual({
      harnessIds: ['claude', 'rovo'],
      origin: 'detection',
    });
  });

  it('ignores harness directories the repository happens to contain', async () => {
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    await mkdir(path.join(cwd, '.rovodev'), { recursive: true });
    await installHarness('rovo');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toEqual({
      harnessIds: ['rovo'],
      origin: 'detection',
    });
  });

  it('reports no harnesses when none is installed and none is declared', async () => {
    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toEqual({
      harnessIds: [],
      origin: 'detection',
    });
  });

  it('prefers a home-tier declaration over what is installed', async () => {
    await installHarness('claude');
    await installHarness('rovo');
    await writeHome('harnesses:\n  use:\n    - claude\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toEqual({
      harnessIds: ['claude'],
      origin: 'declaration',
    });
  });

  it('adds a project-tier harness to the home-tier set', async () => {
    await writeHome('harnesses:\n  use:\n    - claude\n');
    await writeProject('harnesses:\n  use:\n    - rovo\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toMatchObject({
      harnessIds: ['claude', 'rovo'],
    });
  });

  it('lets a project-local drop withdraw a home-declared harness', async () => {
    await writeHome('harnesses:\n  use:\n    - claude\n    - rovo\n');
    await writeProjectLocal('harnesses:\n  drop:\n    - rovo\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toMatchObject({
      harnessIds: ['claude'],
    });
  });

  it('orders the declared set canonically rather than by declaration order', async () => {
    await writeHome('harnesses:\n  use:\n    - rovo\n    - claude\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toMatchObject({
      harnessIds: ['claude', 'rovo'],
    });
  });

  it('honors a declaration that resolves to an empty set rather than falling back', async () => {
    await installHarness('claude');
    await writeHome('harnesses:\n  use:\n    - claude\n');
    await writeProject('harnesses:\n  drop:\n    - claude\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toEqual({
      harnessIds: [],
      origin: 'declaration',
    });
  });

  it('falls back when the chain has declarations but none carries a harnesses block', async () => {
    await installHarness('rovo');
    await writeHome('collections:\n  use:\n    - recommended\n');
    await writeProject('rulebooks:\n  use:\n    - alpha\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toEqual({
      harnessIds: ['rovo'],
      origin: 'detection',
    });
  });

  it('keeps home-declared harnesses when a project tier declares root: true', async () => {
    await writeHome('harnesses:\n  use:\n    - claude\n');
    await writeProject('root: true\nharnesses:\n  use:\n    - rovo\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toMatchObject({
      harnessIds: ['claude', 'rovo'],
    });
  });

  it('discards a project-tier harness when the project-local tier declares root: true', async () => {
    await writeHome('harnesses:\n  use:\n    - claude\n');
    await writeProject('harnesses:\n  use:\n    - rovo\n');
    await writeProjectLocal('root: true\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toMatchObject({
      harnessIds: ['claude'],
    });
  });

  it('discards home-declared harnesses when the home-local tier declares root: true', async () => {
    await writeHome('harnesses:\n  use:\n    - claude\n');
    await writeHomeLocal('root: true\nharnesses:\n  use:\n    - rovo\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).toMatchObject({
      harnessIds: ['rovo'],
    });
  });

  it('walks the home pair once when the project base is the home directory', async () => {
    await writeHome('harnesses:\n  use:\n    - claude\n');
    await writeHomeLocal('root: true\nharnesses:\n  use:\n    - rovo\n');

    expect(await resolveTargetHarnesses({ harness: 'all', cwd: homeDir, homeDir })).toMatchObject({
      harnessIds: ['rovo'],
    });
  });

  it('fails on an unknown harness id, naming the file that carries it', async () => {
    await writeProject('harnesses:\n  use:\n    - claud\n');

    await expect(resolveTargetHarnesses({ harness: 'all', cwd, homeDir })).rejects.toThrow(/codeassembly\.yaml/);
  });

  // region | Helpers

  /** Creates a harness's home directory, which is what marks it installed on the machine. */
  async function installHarness(harnessId: 'claude' | 'rovo'): Promise<void> {
    await mkdir(path.join(homeDir, harnessId === 'claude' ? '.claude' : '.rovodev'), { recursive: true });
  }

  /** Writes the user-global `~/.agents/codeassembly.yaml`. */
  async function writeHome(content: string): Promise<void> {
    await writeFile(path.join(homeDir, '.agents', 'codeassembly.yaml'), content, 'utf8');
  }

  /** Writes the user-global-local `~/.agents/codeassembly.local.yaml`. */
  async function writeHomeLocal(content: string): Promise<void> {
    await writeFile(path.join(homeDir, '.agents', 'codeassembly.local.yaml'), content, 'utf8');
  }

  /** Writes the project-scope `.agents/codeassembly.yaml`. */
  async function writeProject(content: string): Promise<void> {
    await writeFile(path.join(cwd, '.agents', 'codeassembly.yaml'), content, 'utf8');
  }

  /** Writes the project-local `.agents/codeassembly.local.yaml`. */
  async function writeProjectLocal(content: string): Promise<void> {
    await writeFile(path.join(cwd, '.agents', 'codeassembly.local.yaml'), content, 'utf8');
  }

  // endregion | Helpers
});
