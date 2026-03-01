import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readManifest } from '../../lib/manifest.js';
import { getManifestPath } from '../../lib/manifest.js';
import type { InstallOptions } from '../../lib/types.js';
import { installCommand } from '../install.js';
import { uninstallCommand } from '../uninstall.js';

describe('uninstallCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-uninstall-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeInstallOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return {
      platform: 'claude',
      link: false,
      force: false,
      dryRun: false,
      ...overrides,
    };
  }

  it('should remove only manifest-tracked files', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // Install
    await installCommand(makeInstallOptions(), tempDir);

    // Create a manual file that should NOT be removed
    const manualFile = path.join(claudeHome, 'agents', 'manual-agent.md');
    await writeFile(manualFile, 'manual content', 'utf8');

    // Uninstall
    await uninstallCommand({ platform: 'claude', force: false }, tempDir);

    // Manual file should still exist
    expect(existsSync(manualFile)).toBe(true);

    // Manifest should no longer have claude platform
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.platforms.claude).toBeUndefined();
  });

  it('should report when no installation exists for a platform', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(claudeHome, { recursive: true });

    // Should not throw when no installation exists
    await expect(uninstallCommand({ platform: 'claude', force: false }, tempDir)).resolves.not.toThrow();
  });

  it('should skip modified files and preserve platform manifest entry', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // Install first
    await installCommand(makeInstallOptions(), tempDir);

    // Modify an installed subagent file
    const agentFiles = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');
    await writeFile(
      path.join(claudeHome, 'agents', 'orchestrated-coder.md'),
      agentFiles + '\n<!-- user modification -->',
      'utf8',
    );

    // Uninstall without force
    await uninstallCommand({ platform: 'claude', force: false }, tempDir);

    // Modified file should still exist
    expect(existsSync(path.join(claudeHome, 'agents', 'orchestrated-coder.md'))).toBe(true);

    // Platform manifest entry should be retained because some files were skipped
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.platforms.claude).toBeDefined();
  });

  it('should remove modified files when force is true', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // Install first
    await installCommand(makeInstallOptions(), tempDir);

    // Modify an installed subagent file
    const agentFiles = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');
    await writeFile(
      path.join(claudeHome, 'agents', 'orchestrated-coder.md'),
      agentFiles + '\n<!-- user modification -->',
      'utf8',
    );

    // Uninstall with force
    await uninstallCommand({ platform: 'claude', force: true }, tempDir);

    // Modified file should be removed
    expect(existsSync(path.join(claudeHome, 'agents', 'orchestrated-coder.md'))).toBe(false);

    // Platform manifest entry should be removed
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.platforms.claude).toBeUndefined();
  });
});
