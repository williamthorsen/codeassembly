import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeContentHash, getManifestPath, readManifest, writeManifest } from '../../lib/manifest.js';
import type { AgentsManifest, InstallOptions } from '../../lib/types.js';
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
      harness: 'claude',
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
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // Manual file should still exist
    expect(existsSync(manualFile)).toBe(true);

    // Manifest should no longer have claude harness
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude).toBeUndefined();
  });

  it('should report when no installation exists for a harness', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(claudeHome, { recursive: true });

    // Should not throw when no installation exists
    await expect(uninstallCommand({ harness: 'claude', force: false }, tempDir)).resolves.not.toThrow();
  });

  it('should skip modified files and preserve harness manifest entry', async () => {
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
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // Modified file should still exist
    expect(existsSync(path.join(claudeHome, 'agents', 'orchestrated-coder.md'))).toBe(true);

    // Harness manifest entry should be retained because some files were skipped
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude).toBeDefined();
  });

  it('should retain only skipped entries in harness manifest after partial uninstall', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // Install
    await installCommand(makeInstallOptions(), tempDir);

    // Modify one installed subagent file
    const agentFile = path.join(claudeHome, 'agents', 'orchestrated-coder.md');
    const original = await readFile(agentFile, 'utf8');
    await writeFile(agentFile, original + '\n<!-- user modification -->', 'utf8');

    // Uninstall without force — modified file is skipped, others are removed
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // Harness manifest should contain only the skipped entry
    const manifest = await readManifest(getManifestPath(tempDir));
    const claudeEntries = manifest.harnesses.claude?.entries;
    assert.ok(claudeEntries, 'Expected claude harness entries to be defined');
    expect(claudeEntries).toHaveLength(1);
    expect(claudeEntries[0]?.relativePath).toBe('agents/orchestrated-coder.md');
  });

  it('should retain only skipped entries in shared manifest after partial uninstall', async () => {
    const sharedHome = path.join(tempDir, '.agents');
    await mkdir(sharedHome, { recursive: true });

    // Create two shared guidance files on disk
    const fileA = path.join(sharedHome, 'AGENTS.md');
    const fileB = path.join(sharedHome, 'EXTRA.md');
    await writeFile(fileA, 'original content A', 'utf8');
    await writeFile(fileB, 'original content B', 'utf8');

    // Write a synthetic manifest with two shared entries
    const hashA = await computeContentHash(fileA);
    const hashB = await computeContentHash(fileB);
    const manifest: AgentsManifest = {
      schemaVersion: 1,
      shared: {
        version: '0.0.0',
        installedAt: new Date().toISOString(),
        entries: [
          { relativePath: 'AGENTS.md', contentHash: hashA, linked: false },
          { relativePath: 'EXTRA.md', contentHash: hashB, linked: false },
        ],
      },
      harnesses: {},
    };
    await writeManifest(getManifestPath(tempDir), manifest);

    // Modify one file so it gets skipped
    await writeFile(fileA, 'modified content A', 'utf8');

    // Uninstall without force — AGENTS.md is skipped, EXTRA.md is removed
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // Shared manifest should contain only the skipped entry
    const updated = await readManifest(getManifestPath(tempDir));
    const sharedEntries = updated.shared?.entries;
    assert.ok(sharedEntries, 'Expected shared entries to be defined');
    expect(sharedEntries).toHaveLength(1);
    expect(sharedEntries[0]?.relativePath).toBe('AGENTS.md');

    // EXTRA.md should be deleted from disk
    expect(existsSync(fileB)).toBe(false);
    // AGENTS.md should still exist
    expect(existsSync(fileA)).toBe(true);
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
    await uninstallCommand({ harness: 'claude', force: true }, tempDir);

    // Modified file should be removed
    expect(existsSync(path.join(claudeHome, 'agents', 'orchestrated-coder.md'))).toBe(false);

    // Harness manifest entry should be removed
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude).toBeUndefined();
  });
});
