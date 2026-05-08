import { existsSync, lstatSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getManifestPath, readManifest } from '../../lib/manifest.js';
import type { InstallOptions } from '../../lib/types.js';
import { installCommand } from '../install.js';
import { statusCommand } from '../status.js';
import { uninstallCommand } from '../uninstall.js';

describe('guidance installation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-guidance-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return {
      platform: 'claude',
      link: false,
      force: false,
      dryRun: false,
      ...overrides,
    };
  }

  describe('shared guidance', () => {
    it('installs AGENTS.md to ~/.agents/', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      expect(existsSync(sharedAgentsMd)).toBe(true);

      const content = await readFile(sharedAgentsMd, 'utf8');
      expect(content).toContain('# Shared agent instructions');
    });

    it('installs even when no platform home directories exist', async () => {
      // No .claude or .rovodev directories exist
      await installCommand(makeOptions({ platform: 'all' }), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      expect(existsSync(sharedAgentsMd)).toBe(true);

      // Verify manifest was written with shared section
      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeDefined();
      expect(manifest.shared?.entries.length).toBeGreaterThan(0);
    });

    it('tracks shared entries in manifest.shared', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeDefined();

      const agentsEntry = manifest.shared?.entries.find((e) => e.relativePath === 'AGENTS.md');
      expect(agentsEntry).toBeDefined();
      expect(agentsEntry?.contentHash).toMatch(/^sha256:/);
      expect(agentsEntry?.linked).toBe(false);
    });

    it('creates symlinks in link mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ link: true }), tempDir);

      // Use lstatSync to check existence and type; existsSync follows symlinks
      // and returns false when the relative target doesn't resolve from tempDir
      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      const stats = lstatSync(sharedAgentsMd);
      expect(stats.isSymbolicLink()).toBe(true);

      const manifest = await readManifest(getManifestPath(tempDir));
      const agentsEntry = manifest.shared?.entries.find((e) => e.relativePath === 'AGENTS.md');
      expect(agentsEntry?.linked).toBe(true);
    });

    it('skips modified shared guidance without --force', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      // Modify the shared guidance file
      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      const original = await readFile(sharedAgentsMd, 'utf8');
      const modified = original + '\n<!-- user modification -->\n';
      await writeFile(sharedAgentsMd, modified, 'utf8');

      // Re-install without --force
      await installCommand(makeOptions(), tempDir);

      const afterReinstall = await readFile(sharedAgentsMd, 'utf8');
      expect(afterReinstall).toBe(modified);
    });

    it('overwrites modified shared guidance with --force', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      const original = await readFile(sharedAgentsMd, 'utf8');
      const modified = original + '\n<!-- user modification -->\n';
      await writeFile(sharedAgentsMd, modified, 'utf8');

      await installCommand(makeOptions({ force: true }), tempDir);

      const afterReinstall = await readFile(sharedAgentsMd, 'utf8');
      expect(afterReinstall).toBe(original);
    });

    it('does not write files in dry-run mode', async () => {
      await installCommand(makeOptions({ platform: 'all', dryRun: true }), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      expect(existsSync(sharedAgentsMd)).toBe(false);

      // Manifest should not have been created
      expect(existsSync(getManifestPath(tempDir))).toBe(false);
    });
  });

  describe('platform-specific guidance', () => {
    it('installs CLAUDE.md to ~/.claude/ for claude platform', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ platform: 'claude' }), tempDir);

      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      expect(existsSync(claudeMd)).toBe(true);

      const content = await readFile(claudeMd, 'utf8');
      expect(content).toContain('# Shared agent instructions');
      expect(content).not.toContain('<!-- include:');
      expect(content).not.toContain('@~/.agents/AGENTS.md');
    });

    it('installs AGENTS.md to ~/.rovodev/ for rovodev platform', async () => {
      const rovodevHome = path.join(tempDir, '.rovodev');
      await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
      await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

      await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

      const rovodevAgentsMd = path.join(rovodevHome, 'AGENTS.md');
      expect(existsSync(rovodevAgentsMd)).toBe(true);

      const content = await readFile(rovodevAgentsMd, 'utf8');
      expect(content).toContain('# Shared agent instructions');
      expect(content).not.toContain('<!-- include:');
      expect(content).not.toContain('@~/.agents/AGENTS.md');
    });

    it('inlines both shared and platform-specific content into rovodev AGENTS.md in source order', async () => {
      const rovodevHome = path.join(tempDir, '.rovodev');
      await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
      await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

      await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

      const content = await readFile(path.join(rovodevHome, 'AGENTS.md'), 'utf8');
      const sharedHeader = '# Shared agent instructions';
      const platformSection = '## Interaction style';
      const sharedIndex = content.indexOf(sharedHeader);
      const platformIndex = content.indexOf(platformSection);
      expect(sharedIndex).toBeGreaterThanOrEqual(0);
      expect(platformIndex).toBeGreaterThan(sharedIndex);
    });

    it('tracks platform guidance in platform manifest entries', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ platform: 'claude' }), tempDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const claudeManifest = manifest.platforms.claude;
      expect(claudeManifest).toBeDefined();

      const guidanceEntry = claudeManifest?.entries.find((e) => e.relativePath === 'CLAUDE.md');
      expect(guidanceEntry).toBeDefined();
      expect(guidanceEntry?.contentHash).toMatch(/^sha256:/);
    });

    it('copies platform guidance (never symlinks) even in link mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ platform: 'claude', link: true }), tempDir);

      // Platform guidance must be copied so install-time path rewriting can take effect;
      // a symlink would expose unrewritten source content to agents.
      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      const stats = lstatSync(claudeMd);
      expect(stats.isSymbolicLink()).toBe(false);
      expect(stats.isFile()).toBe(true);

      const manifest = await readManifest(getManifestPath(tempDir));
      const guidanceEntry = manifest.platforms.claude?.entries.find((e) => e.relativePath === 'CLAUDE.md');
      expect(guidanceEntry?.linked).toBe(false);
    });

    it('overwrites modified platform guidance with --force', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      const original = await readFile(claudeMd, 'utf8');
      const modified = original + '\n<!-- user modification -->\n';
      await writeFile(claudeMd, modified, 'utf8');

      await installCommand(makeOptions({ force: true }), tempDir);

      const afterReinstall = await readFile(claudeMd, 'utf8');
      expect(afterReinstall).toBe(original);
    });

    it('does not write platform guidance in dry-run mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ dryRun: true }), tempDir);

      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      expect(existsSync(claudeMd)).toBe(false);
    });

    it('skips modified platform guidance without --force', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      const original = await readFile(claudeMd, 'utf8');
      const modified = original + '\n<!-- user modification -->\n';
      await writeFile(claudeMd, modified, 'utf8');

      await installCommand(makeOptions(), tempDir);

      const afterReinstall = await readFile(claudeMd, 'utf8');
      expect(afterReinstall).toBe(modified);
    });
  });

  describe('uninstall', () => {
    it('removes shared guidance files', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);
      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(true);

      await uninstallCommand({ platform: 'claude', force: false }, tempDir);

      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(false);

      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeUndefined();
    });

    it('removes platform-specific guidance files', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);
      expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(true);

      await uninstallCommand({ platform: 'claude', force: false }, tempDir);

      expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(false);
    });

    it('skips modified shared guidance without --force', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      const modified = (await readFile(sharedAgentsMd, 'utf8')) + '\n<!-- user modification -->\n';
      await writeFile(sharedAgentsMd, modified, 'utf8');

      await uninstallCommand({ platform: 'claude', force: false }, tempDir);

      // Shared guidance should still exist (modified)
      expect(existsSync(sharedAgentsMd)).toBe(true);

      // Shared manifest should be retained
      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeDefined();
    });

    it('removes shared guidance when no platform home directories exist', async () => {
      // Install with no platform home dirs — only shared guidance is installed
      await installCommand(makeOptions({ platform: 'all' }), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      expect(existsSync(sharedAgentsMd)).toBe(true);

      await uninstallCommand({ platform: 'all', force: false }, tempDir);

      expect(existsSync(sharedAgentsMd)).toBe(false);

      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeUndefined();
    });

    it('removes modified shared guidance with --force', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      const modified = (await readFile(sharedAgentsMd, 'utf8')) + '\n<!-- user modification -->\n';
      await writeFile(sharedAgentsMd, modified, 'utf8');

      await uninstallCommand({ platform: 'claude', force: true }, tempDir);

      expect(existsSync(sharedAgentsMd)).toBe(false);
      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeUndefined();
    });
  });

  describe('link policy (end-to-end)', () => {
    async function setupAllPlatforms(): Promise<void> {
      const claudeHome = path.join(tempDir, '.claude');
      const rovodevHome = path.join(tempDir, '.rovodev');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });
      await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
      await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });
    }

    async function collectBareRelativeLinks(): Promise<Array<{ file: string; target: string }>> {
      const violations: Array<{ file: string; target: string }> = [];
      for (const tier of ['.claude', '.rovodev', '.agents']) {
        const tierDir = path.join(tempDir, tier);
        if (!existsSync(tierDir)) {
          continue;
        }
        await walkMarkdownFiles(tierDir, async (filePath) => {
          const content = await readFile(filePath, 'utf8');
          const matches = content.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g);
          for (const match of matches) {
            const target = match[2];
            if (target === undefined || /^(https?:\/\/|\/|~\/|#)/.test(target)) {
              continue;
            }
            violations.push({ file: path.relative(tempDir, filePath), target });
          }
        });
      }
      return violations;
    }

    it('no installed .md contains a bare-relative Markdown link target (copy mode)', async () => {
      await setupAllPlatforms();
      await installCommand(makeOptions({ platform: 'all', link: false }), tempDir);

      const violations = await collectBareRelativeLinks();
      expect(violations, formatViolations(violations)).toEqual([]);
    });

    it('--link mode does not bypass path rewriting', async () => {
      await setupAllPlatforms();
      await installCommand(makeOptions({ platform: 'all', link: true }), tempDir);

      const violations = await collectBareRelativeLinks();
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  });

  describe('status', () => {
    it('reports shared guidance state', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const infoSpy = vi.spyOn(console, 'info');
      await statusCommand({ platform: 'claude' }, tempDir);

      const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('shared (~/.agents/)');
      expect(output).toContain('current');

      infoSpy.mockRestore();
    });

    it('reports missing shared guidance when file is deleted from disk', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      // Delete the installed shared guidance file
      await rm(path.join(tempDir, '.agents', 'AGENTS.md'));

      const infoSpy = vi.spyOn(console, 'info');
      await statusCommand({ platform: 'claude' }, tempDir);

      const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('missing:');
      expect(output).toContain('AGENTS.md');

      infoSpy.mockRestore();
    });

    it('reports platform guidance state', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const infoSpy = vi.spyOn(console, 'info');
      await statusCommand({ platform: 'claude' }, tempDir);

      const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      // Platform section should report CLAUDE.md as current
      expect(output).toContain('claude:');
      expect(output).toMatch(/\d+ current/);

      infoSpy.mockRestore();
    });

    it('reports modified shared guidance', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      const modified = (await readFile(sharedAgentsMd, 'utf8')) + '\n<!-- user modification -->\n';
      await writeFile(sharedAgentsMd, modified, 'utf8');

      const infoSpy = vi.spyOn(console, 'info');
      await statusCommand({ platform: 'claude' }, tempDir);

      const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('modified: AGENTS.md');

      infoSpy.mockRestore();
    });
  });
});

async function walkMarkdownFiles(dir: string, visit: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = await lstat(full);
    // Skip symlinks — readFile follows links, so for installed .md files this test
    // depends on copy-mode for platform guidance (guaranteed by installPlatformGuidance).
    // Symlinked content (shared guidance in --link mode, scripts) is validated elsewhere.
    if (info.isSymbolicLink()) {
      continue;
    }
    if (info.isDirectory()) {
      await walkMarkdownFiles(full, visit);
    } else if (entry.endsWith('.md')) {
      await visit(full);
    }
  }
}

function formatViolations(violations: ReadonlyArray<{ file: string; target: string }>): string {
  if (violations.length === 0) {
    return '';
  }
  const lines = violations.map((v) => `  ${v.file}: [...](${v.target})`);
  return `Installed Markdown contains bare-relative link targets:\n${lines.join('\n')}`;
}
