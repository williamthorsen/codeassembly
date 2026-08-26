import assert from 'node:assert';
import { existsSync, lstatSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getManifestPath, readManifest, writeManifest } from '../../lib/manifest.ts';
import type { AgentsManifest, InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';
import { uninstallCommand } from '../uninstall.ts';

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

  it('warns and still removes tracked items when the harness config cannot be parsed', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeInstallOptions({ hooks: false }), tempDir, contentDir);
    const settingsPath = path.join(claudeHome, 'settings.json');
    await writeFile(settingsPath, '{ not json', 'utf8');

    using silent = silenceConsole(['warn']);
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);
    const warnLines = silent.warn.mock.calls.map((call) => String(call[0]));

    expect(warnLines.some((line) => line.includes('Skipping hook-entry removal'))).toBe(true);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude).toBeUndefined();
  });

  it('removes the session-lifecycle hook entries but not foreign settings content', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });
    const settingsPath = path.join(claudeHome, 'settings.json');
    await writeFile(settingsPath, `${JSON.stringify({ model: 'opus' }, undefined, 2)}\n`, 'utf8');

    await installCommand(makeInstallOptions(), tempDir, contentDir);
    expect(await readFile(settingsPath, 'utf8')).toContain('--sentinel codeassembly-agents');

    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    const settings = await readFile(settingsPath, 'utf8');
    expect(settings).not.toContain('--sentinel codeassembly-agents');
    expect(settings).toContain('"model": "opus"');
  });

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

    // Modify an installed script file
    const scriptPath = path.join(claudeHome, 'scripts', 'demo.sh');
    await writeFile(scriptPath, '#!/usr/bin/env bash\necho tampered\n', 'utf8');

    // Uninstall without force
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // Modified file should still exist
    expect(existsSync(scriptPath)).toBe(true);

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

    // Modify one installed script file
    const scriptPath = path.join(claudeHome, 'scripts', 'demo.sh');
    await writeFile(scriptPath, '#!/usr/bin/env bash\necho tampered\n', 'utf8');

    // Uninstall without force — modified file is skipped, others are removed
    await uninstallCommand({ harness: 'claude', force: false }, tempDir);

    // Harness manifest should contain only the skipped entry
    const manifest = await readManifest(getManifestPath(tempDir));
    const claudeEntries = manifest.harnesses.claude?.entries;
    assert.ok(claudeEntries, 'Expected claude harness entries to be defined');
    expect(claudeEntries).toHaveLength(1);
    expect(claudeEntries[0]?.relativePath).toBe('scripts/demo.sh');
  });

  it('should remove modified files when force is true', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // Install first
    await installCommand(makeInstallOptions(), tempDir, contentDir);

    // Modify an installed script file
    const scriptPath = path.join(claudeHome, 'scripts', 'demo.sh');
    await writeFile(scriptPath, '#!/usr/bin/env bash\necho tampered\n', 'utf8');

    // Uninstall with force
    await uninstallCommand({ harness: 'claude', force: true }, tempDir);

    // Modified file should be removed
    expect(existsSync(scriptPath)).toBe(false);

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
