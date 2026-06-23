import assert from 'node:assert';
import { existsSync, lstatSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeContentHash, getManifestPath, readManifest, writeManifest } from '../../lib/manifest.ts';
import type { AgentsManifest, InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { uninstallCommand } from '../uninstall.ts';
import { buildContentTree } from './build-content-tree.ts';

describe('uninstallCommand', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-uninstall-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(tempDir, { recursive: true });
    await buildContentTree(contentDir);
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

  /** Creates an owned symlink under the claude harness home pointing to a fresh source file, recorded in a single-entry manifest. */
  async function writeLinkedEntry(
    relativePath: string,
    sourceContent: string,
  ): Promise<{ linkPath: string; source: string }> {
    const linkPath = path.join(tempDir, '.claude', relativePath);
    await mkdir(path.dirname(linkPath), { recursive: true });
    const source = path.join(tempDir, 'source', path.basename(relativePath));
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, sourceContent, 'utf8');
    await symlink(source, linkPath);

    const manifest: AgentsManifest = {
      schemaVersion: 1,
      harnesses: {
        claude: {
          harness: 'claude',
          version: '0.0.0',
          installedAt: new Date().toISOString(),
          entries: [{ relativePath, contentHash: 'sha256:linked', linked: true }],
        },
      },
    };
    await writeManifest(getManifestPath(tempDir), manifest);
    return { linkPath, source };
  }

  it('should remove only manifest-tracked files', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // Install
    await installCommand(makeInstallOptions(), tempDir, contentDir);

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
    await installCommand(makeInstallOptions(), tempDir, contentDir);

    // Modify an installed subagent file
    const agentFiles = await readFile(path.join(claudeHome, 'agents', 'demo-agent.md'), 'utf8');
    await writeFile(
      path.join(claudeHome, 'agents', 'demo-agent.md'),
      agentFiles + '\n<!-- user modification -->',
      'utf8',
    );

    // Uninstall without force
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // Modified file should still exist
    expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(true);

    // Harness manifest entry should be retained because some files were skipped
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude).toBeDefined();
  });

  it('should retain only skipped entries in harness manifest after partial uninstall', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // Install
    await installCommand(makeInstallOptions(), tempDir, contentDir);

    // Modify one installed subagent file
    const agentFile = path.join(claudeHome, 'agents', 'demo-agent.md');
    const original = await readFile(agentFile, 'utf8');
    await writeFile(agentFile, original + '\n<!-- user modification -->', 'utf8');

    // Uninstall without force — modified file is skipped, others are removed
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // Harness manifest should contain only the skipped entry
    const manifest = await readManifest(getManifestPath(tempDir));
    const claudeEntries = manifest.harnesses.claude?.entries;
    assert.ok(claudeEntries, 'Expected claude harness entries to be defined');
    expect(claudeEntries).toHaveLength(1);
    expect(claudeEntries[0]?.relativePath).toBe('agents/demo-agent.md');
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
    await installCommand(makeInstallOptions(), tempDir, contentDir);

    // Modify an installed subagent file
    const agentFiles = await readFile(path.join(claudeHome, 'agents', 'demo-agent.md'), 'utf8');
    await writeFile(
      path.join(claudeHome, 'agents', 'demo-agent.md'),
      agentFiles + '\n<!-- user modification -->',
      'utf8',
    );

    // Uninstall with force
    await uninstallCommand({ harness: 'claude', force: true }, tempDir);

    // Modified file should be removed
    expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(false);

    // Harness manifest entry should be removed
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude).toBeUndefined();
  });

  it('removes a dangling owned symlink whose source was deleted', async () => {
    const { linkPath, source } = await writeLinkedEntry('skills/helper.mjs', 'export const x = 1;');
    await rm(source); // Leave the symlink dangling, as a deleted source would.

    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // existsSync already reads false for a dangling link, so assert the link entry itself is gone.
    expect(() => lstatSync(linkPath)).toThrow();
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude).toBeUndefined();
  });

  it('removes an owned symlink whose target content changed, without force', async () => {
    const { linkPath, source } = await writeLinkedEntry('skills/helper.mjs', 'original');
    await writeFile(source, 'changed', 'utf8'); // A symlink has no user content to preserve.

    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    expect(existsSync(linkPath)).toBe(false);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude).toBeUndefined();
  });

  it('treats a tracked entry already gone from disk as removed', async () => {
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    const manifest: AgentsManifest = {
      schemaVersion: 1,
      harnesses: {
        claude: {
          harness: 'claude',
          version: '0.0.0',
          installedAt: new Date().toISOString(),
          entries: [{ relativePath: 'skills/missing.md', contentHash: 'sha256:missing', linked: false }],
        },
      },
    };
    await writeManifest(getManifestPath(tempDir), manifest);

    await expect(uninstallCommand({ harness: 'claude', force: false }, tempDir)).resolves.not.toThrow();

    const updated = await readManifest(getManifestPath(tempDir));
    expect(updated.harnesses.claude).toBeUndefined();
  });
});
