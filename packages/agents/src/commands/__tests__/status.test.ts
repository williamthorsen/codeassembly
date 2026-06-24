import { mkdir, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveHarnessPaths } from '../../lib/harness.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { statusCommand } from '../status.ts';
import { buildContentTree } from './build-content-tree.ts';

describe('statusCommand', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-status-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(tempDir, { recursive: true });
    await buildContentTree(contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeInstallOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  it('should report all entries as current after install', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    const infoSpy = vi.spyOn(console, 'info');
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('current');
    expect(output).not.toContain('modified:');
    expect(output).not.toContain('missing:');

    infoSpy.mockRestore();
  });

  it('should report not installed for a harness with no manifest', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(claudeHome, { recursive: true });

    const infoSpy = vi.spyOn(console, 'info');
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('not installed');

    infoSpy.mockRestore();
  });

  it('should report missing when an installed file is deleted', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    const paths = resolveHarnessPaths('claude', tempDir);
    const agentFiles = await readdir(paths.subagentsDir);
    const firstAgent = agentFiles[0];
    if (firstAgent === undefined) {
      throw new Error('Expected at least one installed agent file');
    }
    await unlink(path.join(paths.subagentsDir, firstAgent));

    const infoSpy = vi.spyOn(console, 'info');
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('missing:');

    infoSpy.mockRestore();
  });

  it('should report modified when an installed file is overwritten', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    const paths = resolveHarnessPaths('claude', tempDir);
    const agentFiles = await readdir(paths.subagentsDir);
    const firstAgent = agentFiles[0];
    if (firstAgent === undefined) {
      throw new Error('Expected at least one installed agent file');
    }
    await writeFile(path.join(paths.subagentsDir, firstAgent), 'tampered content', 'utf8');

    const infoSpy = vi.spyOn(console, 'info');
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('modified:');

    infoSpy.mockRestore();
  });
});
