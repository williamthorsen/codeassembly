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
      harness: 'claude',
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

    it('installs even when no harness home directories exist', async () => {
      // No .claude or .rovodev directories exist
      await installCommand(makeOptions({ harness: 'all' }), tempDir);

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
      await installCommand(makeOptions({ harness: 'all', dryRun: true }), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      expect(existsSync(sharedAgentsMd)).toBe(false);

      // Manifest should not have been created
      expect(existsSync(getManifestPath(tempDir))).toBe(false);
    });
  });

  describe('harness-specific guidance', () => {
    it('installs CLAUDE.md to ~/.claude/ for claude harness', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ harness: 'claude' }), tempDir);

      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      expect(existsSync(claudeMd)).toBe(true);

      const content = await readFile(claudeMd, 'utf8');
      expect(content).toContain('# Shared agent instructions');
      expect(content).not.toContain('<!-- include:');
      expect(content).not.toContain('@~/.agents/AGENTS.md');
    });

    it('installs AGENTS.md to ~/.rovodev/ for rovodev harness', async () => {
      const rovodevHome = path.join(tempDir, '.rovodev');
      await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
      await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

      await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

      const rovodevAgentsMd = path.join(rovodevHome, 'AGENTS.md');
      expect(existsSync(rovodevAgentsMd)).toBe(true);

      const content = await readFile(rovodevAgentsMd, 'utf8');
      expect(content).toContain('# Shared agent instructions');
      expect(content).not.toContain('<!-- include:');
      expect(content).not.toContain('@~/.agents/AGENTS.md');

      // Standalone codeassembly-guidance.md is also installed under ~/.rovodev/, separate from
      // being inlined into AGENTS.md, so ad-hoc references to that path continue to resolve.
      const standaloneGuidance = path.join(rovodevHome, 'codeassembly-guidance.md');
      expect(existsSync(standaloneGuidance)).toBe(true);
      const standaloneContent = await readFile(standaloneGuidance, 'utf8');
      expect(standaloneContent).toContain('## Interaction style');
    });

    it('inlines both shared and harness-specific content into rovodev AGENTS.md in source order', async () => {
      const rovodevHome = path.join(tempDir, '.rovodev');
      await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
      await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

      await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

      const content = await readFile(path.join(rovodevHome, 'AGENTS.md'), 'utf8');
      const sharedHeader = '# Shared agent instructions';
      const harnessSection = '## Interaction style';
      const sharedIndex = content.indexOf(sharedHeader);
      const harnessIndex = content.indexOf(harnessSection);
      expect(sharedIndex).toBeGreaterThanOrEqual(0);
      expect(harnessIndex).toBeGreaterThan(sharedIndex);
    });

    it('tracks harness guidance in harness manifest entries', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ harness: 'claude' }), tempDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const claudeManifest = manifest.harnesses.claude;
      expect(claudeManifest).toBeDefined();

      const guidanceEntry = claudeManifest?.entries.find((e) => e.relativePath === 'CLAUDE.md');
      expect(guidanceEntry).toBeDefined();
      expect(guidanceEntry?.contentHash).toMatch(/^sha256:/);
    });

    it('copies harness guidance (never symlinks) even in link mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ harness: 'claude', link: true }), tempDir);

      // Harness guidance must be copied so install-time path rewriting can take effect;
      // a symlink would expose unrewritten source content to agents.
      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      const stats = lstatSync(claudeMd);
      expect(stats.isSymbolicLink()).toBe(false);
      expect(stats.isFile()).toBe(true);

      const manifest = await readManifest(getManifestPath(tempDir));
      const guidanceEntry = manifest.harnesses.claude?.entries.find((e) => e.relativePath === 'CLAUDE.md');
      expect(guidanceEntry?.linked).toBe(false);
    });

    it('overwrites modified harness guidance with --force', async () => {
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

    it('does not write harness guidance in dry-run mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ dryRun: true }), tempDir);

      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      expect(existsSync(claudeMd)).toBe(false);
    });

    it('skips modified harness guidance without --force', async () => {
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

      await uninstallCommand({ harness: 'claude', force: false }, tempDir);

      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(false);

      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeUndefined();
    });

    it('removes harness-specific guidance files', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);
      expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(true);

      await uninstallCommand({ harness: 'claude', force: false }, tempDir);

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

      await uninstallCommand({ harness: 'claude', force: false }, tempDir);

      // Shared guidance should still exist (modified)
      expect(existsSync(sharedAgentsMd)).toBe(true);

      // Shared manifest should be retained
      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeDefined();
    });

    it('removes shared guidance when no harness home directories exist', async () => {
      // Install with no harness home dirs — only shared guidance is installed
      await installCommand(makeOptions({ harness: 'all' }), tempDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      expect(existsSync(sharedAgentsMd)).toBe(true);

      await uninstallCommand({ harness: 'all', force: false }, tempDir);

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

      await uninstallCommand({ harness: 'claude', force: true }, tempDir);

      expect(existsSync(sharedAgentsMd)).toBe(false);
      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared).toBeUndefined();
    });
  });

  describe('link policy (end-to-end)', () => {
    async function setupAllHarnesses(): Promise<void> {
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
      await setupAllHarnesses();
      await installCommand(makeOptions({ harness: 'all', link: false }), tempDir);

      const violations = await collectBareRelativeLinks();
      expect(violations, formatViolations(violations)).toEqual([]);
    });

    it('--link mode does not bypass path rewriting', async () => {
      await setupAllHarnesses();
      await installCommand(makeOptions({ harness: 'all', link: true }), tempDir);

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
      await statusCommand({ harness: 'claude' }, tempDir);

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
      await statusCommand({ harness: 'claude' }, tempDir);

      const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('missing:');
      expect(output).toContain('AGENTS.md');

      infoSpy.mockRestore();
    });

    it('reports harness guidance state', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const infoSpy = vi.spyOn(console, 'info');
      await statusCommand({ harness: 'claude' }, tempDir);

      const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      // Harness section should report CLAUDE.md as current
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
      await statusCommand({ harness: 'claude' }, tempDir);

      const output = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('modified: AGENTS.md');

      infoSpy.mockRestore();
    });
  });

  describe('include directive expansion errors', () => {
    /**
     * Builds the minimum content tree the install pipeline expects to traverse, so a test can
     * inject a deliberately-broken harness guidance source file without depending on the real
     * package content.
     */
    async function buildFakeContentTree(contentDir: string, options: { brokenClaudeBody: string }): Promise<void> {
      await mkdir(path.join(contentDir, 'guidance', 'shared'), { recursive: true });
      await mkdir(path.join(contentDir, 'guidance', '_harnesses', 'claude'), { recursive: true });
      await mkdir(path.join(contentDir, 'guidance', '_harnesses', 'rovodev'), { recursive: true });
      await mkdir(path.join(contentDir, 'skills'), { recursive: true });
      await mkdir(path.join(contentDir, 'subagents'), { recursive: true });
      await mkdir(path.join(contentDir, 'scripts'), { recursive: true });

      await writeFile(path.join(contentDir, 'guidance', 'shared', 'AGENTS.md'), '# Fake shared\n', 'utf8');
      await writeFile(
        path.join(contentDir, 'guidance', '_harnesses', 'claude', 'CLAUDE.md'),
        options.brokenClaudeBody,
        'utf8',
      );
    }

    it('propagates a missing-target error from a harness source even in dry-run mode', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildFakeContentTree(contentDir, { brokenClaudeBody: '<!-- include: ./does-not-exist.md / -->\n' });

      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await expect(
        installCommand(makeOptions({ harness: 'claude', dryRun: true }), tempDir, contentDir),
      ).rejects.toMatchObject({
        name: 'DirectiveExpansionError',
        reason: 'not-found',
      });

      // No harness guidance file should be written in dry-run mode regardless of the failure.
      expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(false);
    });

    it('propagates an out-of-tree error during a real install', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildFakeContentTree(contentDir, { brokenClaudeBody: '<!-- include: ../../../../escape.md / -->\n' });

      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await expect(installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir)).rejects.toMatchObject({
        name: 'DirectiveExpansionError',
        reason: 'out-of-tree',
      });
    });
  });
});

async function walkMarkdownFiles(dir: string, visit: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = await lstat(full);
    // Skip symlinks — readFile follows links, so for installed .md files this test
    // depends on copy-mode for harness guidance (guaranteed by installHarnessGuidance).
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
