import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeContentHash, getManifestPath, readManifest, writeManifest } from '../../lib/manifest.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { declareFixtureSource } from '../test-utils/declare-fixture-source.ts';

describe('install stale-file pruning', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-prune-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  it('removes an orphaned script whose source was deleted', async () => {
    const contentDir = await buildContent({ scripts: { 'keep.sh': scriptBody, 'drop.sh': scriptBody } });
    await installCommand(makeOptions(), tempDir);

    await rm(path.join(contentDir, 'scripts', 'drop.sh'));
    await installCommand(makeOptions(), tempDir);

    expect(existsSync(path.join(tempDir, '.claude', 'scripts', 'drop.sh'))).toBe(false);
    expect(existsSync(path.join(tempDir, '.claude', 'scripts', 'keep.sh'))).toBe(true);
  });

  it('keeps a user-modified orphan without --force and retains it in the manifest', async () => {
    const contentDir = await buildContent({ scripts: { 'keep.sh': scriptBody, 'drop.sh': scriptBody } });
    await installCommand(makeOptions(), tempDir);

    const installedScript = path.join(tempDir, '.claude', 'scripts', 'drop.sh');
    await writeFile(installedScript, '#!/usr/bin/env bash\necho edited\n', 'utf8');
    await rm(path.join(contentDir, 'scripts', 'drop.sh'));
    await installCommand(makeOptions(), tempDir);

    expect(existsSync(installedScript)).toBe(true);
    const manifest = await readManifest(getManifestPath(tempDir));
    const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(paths).toContain('scripts/drop.sh');
  });

  it('removes a user-modified orphan when --force is set', async () => {
    const contentDir = await buildContent({ scripts: { 'keep.sh': scriptBody, 'drop.sh': scriptBody } });
    await installCommand(makeOptions(), tempDir);

    const installedScript = path.join(tempDir, '.claude', 'scripts', 'drop.sh');
    await writeFile(installedScript, '#!/usr/bin/env bash\necho edited\n', 'utf8');
    await rm(path.join(contentDir, 'scripts', 'drop.sh'));
    await installCommand(makeOptions({ force: true }), tempDir);

    expect(existsSync(installedScript)).toBe(false);
    const manifest = await readManifest(getManifestPath(tempDir));
    const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(paths).not.toContain('scripts/drop.sh');
  });

  it('in dry-run, leaves an orphan on disk and does not rewrite the manifest', async () => {
    const contentDir = await buildContent({ scripts: { 'keep.sh': scriptBody, 'drop.sh': scriptBody } });
    await installCommand(makeOptions(), tempDir);

    await rm(path.join(contentDir, 'scripts', 'drop.sh'));
    await installCommand(makeOptions({ dryRun: true }), tempDir);

    expect(existsSync(path.join(tempDir, '.claude', 'scripts', 'drop.sh'))).toBe(true);
    const manifest = await readManifest(getManifestPath(tempDir));
    const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(paths).toContain('scripts/drop.sh');
  });

  it('leaves a skills-directory entry that no earlier install recorded', async () => {
    const preExisting = path.join(tempDir, '.claude', 'skills', '_data');
    await mkdir(preExisting, { recursive: true });
    await writeFile(path.join(preExisting, 'user-note.md'), '# mine\n', 'utf8');

    await buildContent({ scripts: { 'keep.sh': scriptBody } });
    await installCommand(makeOptions(), tempDir);

    expect(existsSync(path.join(preExisting, 'user-note.md'))).toBe(true);
  });

  describe('support entries recorded in the flat skills slot by an earlier install', () => {
    it('removes them from disk and from the manifest', async () => {
      await buildContent({ scripts: { 'keep.sh': scriptBody } });
      await seedFlatSupportEntries();
      using silent = silenceConsole(['info', 'warn']);

      await installCommand(makeOptions(), tempDir);

      expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(false);
      expect(existsSync(glossaryPath())).toBe(false);
      const manifest = await readManifest(getManifestPath(tempDir));
      const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
      expect(paths).not.toContain('skills/_data');
      expect(paths).not.toContain('skills/glossary.md');
      expect(paths).toContain('scripts/keep.sh');
      const infoLines = silent.info.mock.calls.map((call) => String(call[0]));
      expect(infoLines).toContainEqual(expect.stringContaining('Removed stale item: skills/_data'));
      expect(infoLines).toContainEqual(expect.stringContaining('Removed stale item: skills/glossary.md'));
    });

    it('keeps a user-modified one without --force, still tracked, and warns', async () => {
      await buildContent({ scripts: { 'keep.sh': scriptBody } });
      await seedFlatSupportEntries();
      await writeFile(glossaryPath(), EDITED_GLOSSARY, 'utf8');
      using silent = silenceConsole(['info', 'warn']);

      await installCommand(makeOptions(), tempDir);

      expect(await readFile(glossaryPath(), 'utf8')).toBe(EDITED_GLOSSARY);
      expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(false);
      const manifest = await readManifest(getManifestPath(tempDir));
      const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
      expect(paths).toContain('skills/glossary.md');
      expect(paths).not.toContain('skills/_data');
      expect(silent.warn.mock.calls.map((call) => String(call[0]))).toContainEqual(
        expect.stringContaining('Keeping modified stale item: skills/glossary.md'),
      );
    });

    it('removes a user-modified one when --force is set', async () => {
      await buildContent({ scripts: { 'keep.sh': scriptBody } });
      await seedFlatSupportEntries();
      await writeFile(glossaryPath(), EDITED_GLOSSARY, 'utf8');
      using _silent = silenceConsole(['info', 'warn']);

      await installCommand(makeOptions({ force: true }), tempDir);

      expect(existsSync(glossaryPath())).toBe(false);
      const manifest = await readManifest(getManifestPath(tempDir));
      const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
      expect(paths).not.toContain('skills/glossary.md');
    });
  });

  // region | Helpers

  const scriptBody = '#!/usr/bin/env bash\necho hi\n';

  const EDITED_GLOSSARY = '# Glossary\n\nEdited by hand.\n';

  /**
   * Builds a minimal content tree under a fresh temp directory, declares it as the home's fixture source, and returns
   * its path. Only the scripts named in `options` get extra files; the baseline (claude guidance, subagent overlay) is
   * always present so that the install pipeline runs end to end.
   */
  async function buildContent(options: { scripts?: Record<string, string> }): Promise<string> {
    const contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(contentDir, 'guidance', '_harnesses', 'claude'), { recursive: true });
    await mkdir(path.join(contentDir, 'subagents', '_data'), { recursive: true });
    await mkdir(path.join(contentDir, 'skills'), { recursive: true });
    await mkdir(path.join(contentDir, 'scripts'), { recursive: true });

    await writeFile(path.join(contentDir, 'guidance', '_harnesses', 'claude', 'CLAUDE.md'), '# Claude\n', 'utf8');
    await writeFile(path.join(contentDir, 'subagents', '_data', 'claude.yaml'), '_defaults: {}\n', 'utf8');

    const scripts = options.scripts ?? {};
    for (const [name, body] of Object.entries(scripts)) {
      await writeFile(path.join(contentDir, 'scripts', name), body, 'utf8');
    }

    await declareFixtureSource(tempDir, contentDir);
    return contentDir;
  }

  /** Returns the claude home path of the flat Markdown support entry that `seedFlatSupportEntries` plants. */
  function glossaryPath(): string {
    return path.join(tempDir, '.claude', 'skills', 'glossary.md');
  }

  /**
   * Plants what an install that deployed support entries to the flat skills slot left behind: a `skills/_data`
   * directory with a file in it and a flat `skills/glossary.md`, each recorded in the claude manifest in the form
   * that such an install wrote (a sentinel hash for the directory, a content hash for the file).
   */
  async function seedFlatSupportEntries(): Promise<void> {
    const dataDir = path.join(tempDir, '.claude', 'skills', '_data');
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'sample.md'), '# Sample\n', 'utf8');
    await writeFile(glossaryPath(), '# Glossary\n', 'utf8');

    await writeManifest(getManifestPath(tempDir), {
      schemaVersion: 2,
      harnesses: {
        claude: {
          harness: 'claude',
          version: '0.1.0',
          installedAt: new Date().toISOString(),
          entries: [
            { relativePath: 'skills/_data', contentHash: 'sha256:dir:skills/_data', linked: false },
            {
              relativePath: 'skills/glossary.md',
              contentHash: await computeContentHash(glossaryPath()),
              linked: false,
            },
          ],
        },
      },
    });
  }

  // endregion | Helpers
});
