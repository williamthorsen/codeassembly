import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRulebooksManifest } from '../../lib/rulebooks-manifest.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { initCommand } from '../init.ts';

describe(initCommand, () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = path.join(tmpdir(), `agents-test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  const manifestPath = (): string => path.join(projectRoot, '.agents', 'rulebooks.yaml');

  it('creates rulebooks.yaml with an empty declaration, creating .agents if absent', async () => {
    await initCommand(makeOptions(), projectRoot);

    const content = await readFile(manifestPath(), 'utf8');
    expect(content).toContain('rulebooks: []');
  });

  it('scaffolds a file that parses to zero declared rulebooks', async () => {
    await initCommand(makeOptions(), projectRoot);

    expect(await readRulebooksManifest(projectRoot)).toEqual([]);
  });

  it('refuses to overwrite an existing rulebooks.yaml', async () => {
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(manifestPath(), 'rulebooks:\n  - shell-conventions\n', 'utf8');

    await expect(initCommand(makeOptions(), projectRoot)).rejects.toThrow(/overwrite/i);

    const preserved = await readFile(manifestPath(), 'utf8');
    expect(preserved).toContain('shell-conventions');
  });

  it('in dry-run mode, does not create the file', async () => {
    await initCommand(makeOptions({ dryRun: true }), projectRoot);

    expect(existsSync(manifestPath())).toBe(false);
  });
});
