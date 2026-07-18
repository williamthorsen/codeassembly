import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('reports the session-lifecycle hook entries alongside the installed items', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    const infoSpy = vi.spyOn(console, 'info');
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Hooks: 4 present, 0 drifted, 0 absent');

    infoSpy.mockRestore();
  });

  it('warns and completes the report when the harness config cannot be parsed', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions({ hooks: false }), tempDir, contentDir);
    await writeFile(path.join(claudeHome, 'settings.json'), '{ not json', 'utf8');

    const infoSpy = vi.spyOn(console, 'info');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let output: string;
    let warnLines: ReadonlyArray<string>;
    try {
      await statusCommand({ harness: 'claude' }, tempDir);
      output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      warnLines = warnSpy.mock.calls.map((call) => String(call[0]));
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }

    expect(warnLines.some((line) => line.includes('could not read the config'))).toBe(true);
    expect(output).toContain('Summary:');
  });

  it('reports hooks as not configured after a --skip-hooks install', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions({ hooks: false }), tempDir, contentDir);

    const infoSpy = vi.spyOn(console, 'info');
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Hooks: not configured');

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

  it('reports missing when an installed file is deleted', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    await unlink(path.join(tempDir, '.agents', 'AGENTS.md'));

    const infoSpy = vi.spyOn(console, 'info');
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('missing:');

    infoSpy.mockRestore();
  });

  it('reports modified when an installed file is overwritten', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    await writeFile(path.join(tempDir, '.agents', 'AGENTS.md'), 'tampered content', 'utf8');

    const infoSpy = vi.spyOn(console, 'info');
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('modified:');

    infoSpy.mockRestore();
  });
});
