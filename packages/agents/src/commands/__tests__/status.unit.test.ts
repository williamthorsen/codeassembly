import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRunningPackageVersion } from '../../lib/running-package.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { statusCommand } from '../status.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';

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

  it('reports which installation last wrote the home domain', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    using silent = silenceConsole(['info']);
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain(`Home domain last written by ${readRunningPackageVersion()}`);
    expect(output).toContain('via `install`');
  });

  it('stays silent about provenance when nothing has written the home domain', async () => {
    using silent = silenceConsole(['info']);
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).not.toContain('Home domain last written');
  });

  it('should report all entries as current after install', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    using silent = silenceConsole(['info']);
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('current');
    expect(output).not.toContain('modified:');
    expect(output).not.toContain('missing:');
  });

  it('reports the session-lifecycle hook entries alongside the installed items', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    using silent = silenceConsole(['info']);
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Hooks: 4 present, 0 drifted, 0 absent');
  });

  it('warns and completes the report when the harness config cannot be parsed', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions({ hooks: false }), tempDir, contentDir);
    await writeFile(path.join(claudeHome, 'settings.json'), '{ not json', 'utf8');

    using silent = silenceConsole(['info', 'warn']);
    await statusCommand({ harness: 'claude' }, tempDir);
    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    const warnLines = silent.warn.mock.calls.map((call) => String(call[0]));

    expect(warnLines.some((line) => line.includes('could not read the config'))).toBe(true);
    expect(output).toContain('Summary:');
  });

  it('reports hooks as not configured after a --skip-hooks install', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions({ hooks: false }), tempDir, contentDir);

    using silent = silenceConsole(['info']);
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Hooks: not configured');
  });

  it('should report not installed for a harness with no manifest', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(claudeHome, { recursive: true });

    using silent = silenceConsole(['info']);
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('not installed');
  });

  it('reports missing when an installed file is deleted', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    await unlink(path.join(tempDir, '.agents', 'AGENTS.md'));

    using silent = silenceConsole(['info']);
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('missing:');
  });

  it('reports modified when an installed file is overwritten', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions(), tempDir, contentDir);

    await writeFile(path.join(tempDir, '.agents', 'AGENTS.md'), 'tampered content', 'utf8');

    using silent = silenceConsole(['info']);
    await statusCommand({ harness: 'claude' }, tempDir);

    const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('modified:');
  });
});
