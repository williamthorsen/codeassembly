import { existsSync, lstatSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractAmbientRegionContent, hasAmbientRegion, injectAmbientRegion } from '../../lib/ambient-region.ts';
import { computeContentHash, getManifestPath, readManifest } from '../../lib/manifest.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { statusCommand } from '../status.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';
import { uninstallCommand } from '../uninstall.ts';

describe('guidance installation', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-guidance-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(tempDir, { recursive: true });
    await buildContentTree(contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  async function setupClaudeHome(): Promise<string> {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });
    return claudeHome;
  }

  async function setupRovoHome(): Promise<string> {
    const rovoHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovoHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovoHome, 'subagents'), { recursive: true });
    return rovoHome;
  }

  describe('shared guidance', () => {
    it('installs AGENTS.md to ~/.agents/', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);

      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      expect(existsSync(sharedAgentsMd)).toBe(true);
      expect(await readFile(sharedAgentsMd, 'utf8')).toContain('# Fixture shared guidance');
    });

    it('installs even when no harness home directories exist', async () => {
      await installCommand(makeOptions({ harness: 'all' }), tempDir, contentDir);

      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(true);

      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared?.entries.length).toBeGreaterThan(0);
    });

    it('tracks shared entries in manifest.shared', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const entry = manifest.shared?.entries.find((e) => e.relativePath === 'AGENTS.md');
      expect(entry?.contentHash).toMatch(/^sha256:/);
      expect(entry?.linked).toBe(false);
    });

    it('creates symlinks in link mode', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions({ link: true }), tempDir, contentDir);

      // lstatSync (not existsSync, which follows the link) confirms the entry itself is a symlink.
      expect(lstatSync(path.join(tempDir, '.agents', 'AGENTS.md')).isSymbolicLink()).toBe(true);

      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.shared?.entries.find((e) => e.relativePath === 'AGENTS.md')?.linked).toBe(true);
    });

    it('skips modified shared guidance without --force', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);
      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      const modified = (await readFile(sharedAgentsMd, 'utf8')) + '\n<!-- user modification -->\n';
      await writeFile(sharedAgentsMd, modified, 'utf8');

      await installCommand(makeOptions(), tempDir, contentDir);

      expect(await readFile(sharedAgentsMd, 'utf8')).toBe(modified);
    });

    it('overwrites modified shared guidance with --force', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);
      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      const managed = await readFile(sharedAgentsMd, 'utf8');
      await writeFile(sharedAgentsMd, managed + '\n<!-- user modification -->\n', 'utf8');

      await installCommand(makeOptions({ force: true }), tempDir, contentDir);

      expect(await readFile(sharedAgentsMd, 'utf8')).toBe(managed);
    });

    it('does not write files in dry-run mode', async () => {
      await installCommand(makeOptions({ harness: 'all', dryRun: true }), tempDir, contentDir);

      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(false);
      expect(existsSync(getManifestPath(tempDir))).toBe(false);
    });
  });

  describe('harness-specific guidance', () => {
    it('installs CLAUDE.md to ~/.claude/ for claude harness with includes expanded', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      expect(existsSync(claudeMd)).toBe(true);
      const content = await readFile(claudeMd, 'utf8');
      expect(content).toContain('# Fixture shared guidance'); // inlined from the shared include
      expect(content).not.toContain('<!-- include:');
    });

    it('installs AGENTS.md and standalone guidance to ~/.rovodev/ for rovo harness', async () => {
      const rovoHome = await setupRovoHome();

      await installCommand(makeOptions({ harness: 'rovo' }), tempDir, contentDir);

      const rovoAgentsMd = path.join(rovoHome, 'AGENTS.md');
      expect(existsSync(rovoAgentsMd)).toBe(true);
      const content = await readFile(rovoAgentsMd, 'utf8');
      expect(content).toContain('# Fixture shared guidance');
      expect(content).not.toContain('<!-- include:');

      // The standalone guidance file is installed separately from being inlined into AGENTS.md.
      const standalone = path.join(rovoHome, 'codeassembly-guidance.md');
      expect(existsSync(standalone)).toBe(true);
      expect(await readFile(standalone, 'utf8')).toContain('## Fixture interaction');
    });

    it('inlines shared and harness-specific content into rovo AGENTS.md in source order', async () => {
      const rovoHome = await setupRovoHome();

      await installCommand(makeOptions({ harness: 'rovo' }), tempDir, contentDir);

      const content = await readFile(path.join(rovoHome, 'AGENTS.md'), 'utf8');
      const sharedIndex = content.indexOf('# Fixture shared guidance');
      const harnessIndex = content.indexOf('## Fixture interaction');
      expect(sharedIndex).toBeGreaterThanOrEqual(0);
      expect(harnessIndex).toBeGreaterThan(sharedIndex);
    });

    it('renders an empty ambient region into the guidance file of each harness', async () => {
      const claudeHome = await setupClaudeHome();
      const rovoHome = await setupRovoHome();

      await installCommand(makeOptions({ harness: 'all' }), tempDir, contentDir);

      for (const guidancePath of [path.join(claudeHome, 'CLAUDE.md'), path.join(rovoHome, 'AGENTS.md')]) {
        const content = await readFile(guidancePath, 'utf8');
        expect(hasAmbientRegion(content)).toBe(true);
        expect(extractAmbientRegionContent(content)).toBe('');
      }
    });

    it('tracks harness guidance in harness manifest entries', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const entry = manifest.harnesses.claude?.entries.find((e) => e.relativePath === 'CLAUDE.md');
      expect(entry?.contentHash).toMatch(/^sha256:/);
    });

    it('copies harness guidance (never symlinks) even in link mode', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ harness: 'claude', link: true }), tempDir, contentDir);

      // Harness guidance must be copied so install-time path rewriting takes effect; a symlink would expose
      // unrewritten source content to agents.
      const stats = lstatSync(path.join(claudeHome, 'CLAUDE.md'));
      expect(stats.isSymbolicLink()).toBe(false);
      expect(stats.isFile()).toBe(true);

      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.harnesses.claude?.entries.find((e) => e.relativePath === 'CLAUDE.md')?.linked).toBe(false);
    });
  });

  describe('ambient region preservation', () => {
    const AMBIENT_BODY = '<!-- rulebook:writing-prefs -->\nNo em-dashes.\n<!-- /rulebook:writing-prefs -->';
    const AMBIENT_NOTE =
      '<!-- Generated by `codeassembly sync` from the rulebooks named below. Edits inside this region are overwritten. -->';
    /** The whole region content a `sync --global` run writes: the generated note above the rulebook blocks. */
    const AMBIENT_REGION_CONTENT = `${AMBIENT_NOTE}\n${AMBIENT_BODY}`;

    /** Fills the installed file's ambient region as a `sync --global` run would. */
    async function fillAmbientRegion(guidancePath: string): Promise<void> {
      await writeFile(
        guidancePath,
        injectAmbientRegion(await readFile(guidancePath, 'utf8'), AMBIENT_REGION_CONTENT),
        'utf8',
      );
    }

    it('splices sync-written region content into a re-rendered guidance file', async () => {
      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);
      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      await fillAmbientRegion(claudeMd);

      // A changed template forces a genuine re-render, so preservation is exercised as a splice, not as a skip.
      await buildContentTree(contentDir, {
        harnessGuidance: {
          claude: {
            'CLAUDE.md': [
              'Fixture claude preamble v2.',
              '',
              '<!-- codeassembly-ambient:start -->',
              '<!-- codeassembly-ambient:end -->',
              '',
            ].join('\n'),
          },
        },
      });
      await installCommand(makeOptions(), tempDir, contentDir);

      const content = await readFile(claudeMd, 'utf8');
      expect(content).toContain('Fixture claude preamble v2.');
      expect(extractAmbientRegionContent(content)).toBe(AMBIENT_REGION_CONTENT);
    });

    // The note lives in the region body rather than in `renderRegion`, so that `extractAmbientRegionContent` returns
    // it and the splice puts back what it took out. A note added by the wrapper instead would survive extraction and
    // be prepended a second time on re-injection.
    it('carries a note in the region body through a re-render exactly once', async () => {
      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);
      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      await fillAmbientRegion(claudeMd);

      await buildContentTree(contentDir, {
        harnessGuidance: {
          claude: {
            'CLAUDE.md': [
              'Fixture claude preamble v3.',
              '',
              '<!-- codeassembly-ambient:start -->',
              '<!-- codeassembly-ambient:end -->',
              '',
            ].join('\n'),
          },
        },
      });
      await installCommand(makeOptions(), tempDir, contentDir);

      const content = await readFile(claudeMd, 'utf8');
      const noteCount = content.split(AMBIENT_NOTE).length - 1;
      expect(noteCount).toBe(1);
      expect(extractAmbientRegionContent(content)).toBe(AMBIENT_REGION_CONTENT);
    });

    it('does not report sync-written region content as drift', async () => {
      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);
      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      await fillAmbientRegion(claudeMd);

      using silent = silenceConsole(['info']);
      await statusCommand({ harness: 'claude' }, tempDir);

      const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).not.toContain('modified: CLAUDE.md');
    });

    it('still reports a hand edit outside the region as drift', async () => {
      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);
      const claudeMd = path.join(claudeHome, 'CLAUDE.md');
      const modified = (await readFile(claudeMd, 'utf8')) + '\n<!-- user modification -->\n';
      await writeFile(claudeMd, modified, 'utf8');

      await installCommand(makeOptions(), tempDir, contentDir);

      expect(await readFile(claudeMd, 'utf8')).toBe(modified);
    });

    it('hashes a guidance file independently of its region content', async () => {
      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);
      const claudeMd = path.join(claudeHome, 'CLAUDE.md');

      const emptyRegionHash = await computeContentHash(claudeMd);
      await fillAmbientRegion(claudeMd);

      expect(await computeContentHash(claudeMd)).toBe(emptyRegionHash);
    });
  });

  describe('uninstall', () => {
    it('removes shared guidance files', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);
      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(true);

      await uninstallCommand({ harness: 'claude', force: false }, tempDir);

      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(false);
      expect((await readManifest(getManifestPath(tempDir))).shared).toBeUndefined();
    });

    it('removes harness-specific guidance files', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);
      expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(true);

      await uninstallCommand({ harness: 'claude', force: false }, tempDir);

      expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(false);
    });

    it('skips modified shared guidance without --force', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);
      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      await writeFile(
        sharedAgentsMd,
        (await readFile(sharedAgentsMd, 'utf8')) + '\n<!-- user modification -->\n',
        'utf8',
      );

      await uninstallCommand({ harness: 'claude', force: false }, tempDir);

      expect(existsSync(sharedAgentsMd)).toBe(true);
      expect((await readManifest(getManifestPath(tempDir))).shared).toBeDefined();
    });

    it('removes shared guidance when no harness home directories exist', async () => {
      await installCommand(makeOptions({ harness: 'all' }), tempDir, contentDir);
      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      expect(existsSync(sharedAgentsMd)).toBe(true);

      await uninstallCommand({ harness: 'all', force: false }, tempDir);

      expect(existsSync(sharedAgentsMd)).toBe(false);
      expect((await readManifest(getManifestPath(tempDir))).shared).toBeUndefined();
    });

    it('removes modified shared guidance with --force', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);
      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      await writeFile(
        sharedAgentsMd,
        (await readFile(sharedAgentsMd, 'utf8')) + '\n<!-- user modification -->\n',
        'utf8',
      );

      await uninstallCommand({ harness: 'claude', force: true }, tempDir);

      expect(existsSync(sharedAgentsMd)).toBe(false);
      expect((await readManifest(getManifestPath(tempDir))).shared).toBeUndefined();
    });
  });

  describe('status', () => {
    it('reports shared guidance state', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);

      using silent = silenceConsole(['info']);
      await statusCommand({ harness: 'claude' }, tempDir);

      const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('shared (~/.agents/)');
      expect(output).toContain('current');
    });

    it('reports missing shared guidance when file is deleted from disk', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);
      await rm(path.join(tempDir, '.agents', 'AGENTS.md'));

      using silent = silenceConsole(['info']);
      await statusCommand({ harness: 'claude' }, tempDir);

      const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('missing:');
      expect(output).toContain('AGENTS.md');
    });

    it('reports harness guidance state', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);

      using silent = silenceConsole(['info']);
      await statusCommand({ harness: 'claude' }, tempDir);

      const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('claude:');
      expect(output).toMatch(/\d+ current/);
    });

    it('reports modified shared guidance', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);
      const sharedAgentsMd = path.join(tempDir, '.agents', 'AGENTS.md');
      await writeFile(
        sharedAgentsMd,
        (await readFile(sharedAgentsMd, 'utf8')) + '\n<!-- user modification -->\n',
        'utf8',
      );

      using silent = silenceConsole(['info']);
      await statusCommand({ harness: 'claude' }, tempDir);

      const output = silent.info.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('modified: AGENTS.md');
    });
  });

  describe('include directive expansion errors', () => {
    /**
     * Builds the minimum content tree the install pipeline expects to traverse, so a test can inject a
     * deliberately-broken harness guidance source file without depending on the real package content.
     */
    async function buildFakeContentTree(fakeContentDir: string, options: { brokenClaudeBody: string }): Promise<void> {
      await mkdir(path.join(fakeContentDir, 'guidance', 'shared'), { recursive: true });
      await mkdir(path.join(fakeContentDir, 'guidance', '_harnesses', 'claude'), { recursive: true });
      await mkdir(path.join(fakeContentDir, 'guidance', '_harnesses', 'rovo'), { recursive: true });
      await mkdir(path.join(fakeContentDir, 'skills'), { recursive: true });
      await mkdir(path.join(fakeContentDir, 'subagents'), { recursive: true });
      await mkdir(path.join(fakeContentDir, 'scripts'), { recursive: true });

      await writeFile(path.join(fakeContentDir, 'guidance', 'shared', 'AGENTS.md'), '# Fake shared\n', 'utf8');
      await writeFile(
        path.join(fakeContentDir, 'guidance', '_harnesses', 'claude', 'CLAUDE.md'),
        options.brokenClaudeBody,
        'utf8',
      );
    }

    it('propagates a missing-target error from a harness source even in dry-run mode', async () => {
      const fakeContentDir = path.join(tempDir, 'fake-content');
      await buildFakeContentTree(fakeContentDir, { brokenClaudeBody: '<!-- include: ./does-not-exist.md / -->\n' });

      const claudeHome = await setupClaudeHome();

      await expect(
        installCommand(makeOptions({ harness: 'claude', dryRun: true }), tempDir, fakeContentDir),
      ).rejects.toMatchObject({ name: 'DirectiveExpansionError', reason: 'not-found' });

      // No harness guidance file should be written in dry-run mode regardless of the failure.
      expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(false);
    });

    it('propagates an out-of-tree error during a real install', async () => {
      const fakeContentDir = path.join(tempDir, 'fake-content');
      await buildFakeContentTree(fakeContentDir, { brokenClaudeBody: '<!-- include: ../../../../escape.md / -->\n' });

      await setupClaudeHome();

      await expect(installCommand(makeOptions({ harness: 'claude' }), tempDir, fakeContentDir)).rejects.toMatchObject({
        name: 'DirectiveExpansionError',
        reason: 'out-of-tree',
      });
    });
  });

  describe('unresolvable in-body anchors', () => {
    const DEAD_ANCHOR_BODY = '# Fixture guidance\n\nSee [the events](#lifecycle-events).\n';

    it('fails a dry run on a harness guidance file whose anchor names no heading, writing nothing', async () => {
      const badContentDir = path.join(tempDir, 'bad-content');
      await buildContentTree(badContentDir, { harnessGuidance: { claude: { 'CLAUDE.md': DEAD_ANCHOR_BODY } } });
      const claudeHome = await setupClaudeHome();

      await expect(
        installCommand(makeOptions({ harness: 'claude', dryRun: true }), tempDir, badContentDir),
      ).rejects.toThrow(/guidance\/_harnesses\/claude\/CLAUDE\.md carries 1 unresolvable anchor link target/);
      expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(false);
    });

    it('fails a dry run on a shared guidance file whose anchor names no heading, writing nothing', async () => {
      const badContentDir = path.join(tempDir, 'bad-content');
      await buildContentTree(badContentDir, { sharedGuidance: { 'AGENTS.md': DEAD_ANCHOR_BODY } });
      await setupClaudeHome();

      await expect(
        installCommand(makeOptions({ harness: 'claude', dryRun: true }), tempDir, badContentDir),
      ).rejects.toThrow(/guidance\/shared\/AGENTS\.md carries 1 unresolvable anchor link target/);
      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(false);
    });

    it('fails a shared guidance file in link mode, where the symlink would carry the dead locator', async () => {
      const badContentDir = path.join(tempDir, 'bad-content');
      await buildContentTree(badContentDir, { sharedGuidance: { 'AGENTS.md': DEAD_ANCHOR_BODY } });
      await setupClaudeHome();

      await expect(
        installCommand(makeOptions({ harness: 'claude', link: true }), tempDir, badContentDir),
      ).rejects.toThrow(/guidance\/shared\/AGENTS\.md carries 1 unresolvable anchor link target/);
      expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(false);
    });
  });
});
