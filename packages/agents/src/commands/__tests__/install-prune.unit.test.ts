import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getManifestPath, readManifest } from '../../lib/manifest.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';

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

  it('removes an installed support directory whose source was deleted', async () => {
    const contentDir = await buildContent({
      supportDirs: { keep: { 'data.md': '# keep\n' }, drop: { 'data.md': '# drop\n' } },
    });
    await installCommand(makeOptions(), tempDir, contentDir);
    expect(existsSync(path.join(tempDir, '.claude', 'skills', 'drop'))).toBe(true);

    await rm(path.join(contentDir, 'skills', 'drop'), { recursive: true, force: true });
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'skills', 'drop'))).toBe(false);
    expect(existsSync(path.join(tempDir, '.claude', 'skills', 'keep'))).toBe(true);
  });

  it('removes orphaned script and shared-guidance files whose sources were deleted', async () => {
    const contentDir = await buildContent({
      scripts: { 'keep.sh': scriptBody, 'drop.sh': scriptBody },
      shared: { 'AGENTS.md': '# Shared\n', 'EXTRA.md': '# Extra\n' },
    });
    await installCommand(makeOptions(), tempDir, contentDir);

    await rm(path.join(contentDir, 'scripts', 'drop.sh'));
    await rm(path.join(contentDir, 'guidance', 'shared', 'EXTRA.md'));
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'scripts', 'drop.sh'))).toBe(false);
    expect(existsSync(path.join(tempDir, '.agents', 'EXTRA.md'))).toBe(false);
    expect(existsSync(path.join(tempDir, '.claude', 'scripts', 'keep.sh'))).toBe(true);
    expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(true);
  });

  it('keeps a user-modified orphan without --force and retains it in the manifest', async () => {
    const contentDir = await buildContent({ scripts: { 'keep.sh': scriptBody, 'drop.sh': scriptBody } });
    await installCommand(makeOptions(), tempDir, contentDir);

    const installedScript = path.join(tempDir, '.claude', 'scripts', 'drop.sh');
    await writeFile(installedScript, '#!/usr/bin/env bash\necho edited\n', 'utf8');
    await rm(path.join(contentDir, 'scripts', 'drop.sh'));
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(installedScript)).toBe(true);
    const manifest = await readManifest(getManifestPath(tempDir));
    const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(paths).toContain('scripts/drop.sh');
  });

  it('removes a user-modified orphan when --force is set', async () => {
    const contentDir = await buildContent({ scripts: { 'keep.sh': scriptBody, 'drop.sh': scriptBody } });
    await installCommand(makeOptions(), tempDir, contentDir);

    const installedScript = path.join(tempDir, '.claude', 'scripts', 'drop.sh');
    await writeFile(installedScript, '#!/usr/bin/env bash\necho edited\n', 'utf8');
    await rm(path.join(contentDir, 'scripts', 'drop.sh'));
    await installCommand(makeOptions({ force: true }), tempDir, contentDir);

    expect(existsSync(installedScript)).toBe(false);
    const manifest = await readManifest(getManifestPath(tempDir));
    const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(paths).not.toContain('scripts/drop.sh');
  });

  it('in dry-run, leaves an orphan on disk and does not rewrite the manifest', async () => {
    const contentDir = await buildContent({
      supportDirs: { keep: { 'data.md': '# keep\n' }, drop: { 'data.md': '# drop\n' } },
    });
    await installCommand(makeOptions(), tempDir, contentDir);

    await rm(path.join(contentDir, 'skills', 'drop'), { recursive: true, force: true });
    await installCommand(makeOptions({ dryRun: true }), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'skills', 'drop'))).toBe(true);
    const manifest = await readManifest(getManifestPath(tempDir));
    const paths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(paths).toContain('skills/drop');
  });

  it('removes a file deleted from within a still-present multi-file support directory', async () => {
    const contentDir = await buildContent({
      supportDirs: {
        multi: { 'index.md': '# multi\n', 'modules/old.md': '# old\n', 'modules/keep.md': '# keep\n' },
      },
    });
    await installCommand(makeOptions(), tempDir, contentDir);
    expect(existsSync(path.join(tempDir, '.claude', 'skills', 'multi', 'modules', 'old.md'))).toBe(true);

    await rm(path.join(contentDir, 'skills', 'multi', 'modules', 'old.md'));
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'skills', 'multi', 'modules', 'old.md'))).toBe(false);
    expect(existsSync(path.join(tempDir, '.claude', 'skills', 'multi', 'modules', 'keep.md'))).toBe(true);
    expect(existsSync(path.join(tempDir, '.claude', 'skills', 'multi', 'index.md'))).toBe(true);
  });

  it('does not clean a coincidentally same-named directory on first install', async () => {
    const preExisting = path.join(tempDir, '.claude', 'skills', 'multi');
    await mkdir(preExisting, { recursive: true });
    await writeFile(path.join(preExisting, 'user-note.md'), '# mine\n', 'utf8');

    const contentDir = await buildContent({ supportDirs: { multi: { 'index.md': '# multi\n' } } });
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(preExisting, 'user-note.md'))).toBe(true);
    expect(existsSync(path.join(preExisting, 'index.md'))).toBe(true);
  });

  // region | Helpers

  const scriptBody = '#!/usr/bin/env bash\necho hi\n';

  /**
   * Builds a minimal content tree under a fresh temp directory and returns its path. Only the surfaces named in
   * `options` get extra files; the baseline (shared `AGENTS.md`, claude guidance, subagent overlay) is always present
   * so the install pipeline runs end to end. `supportDirs` are written under `skills/<name>/` without a `SKILL.md`,
   * so install treats them as support directories (the skill catalog deploys per-declaration via `sync`, not install).
   */
  async function buildContent(options: {
    supportDirs?: Record<string, Record<string, string>>;
    scripts?: Record<string, string>;
    shared?: Record<string, string>;
  }): Promise<string> {
    const contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(contentDir, 'guidance', 'shared'), { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', '_harnesses', 'claude'), { recursive: true });
    await mkdir(path.join(contentDir, 'subagents', '_data'), { recursive: true });
    await mkdir(path.join(contentDir, 'skills'), { recursive: true });
    await mkdir(path.join(contentDir, 'scripts'), { recursive: true });

    await writeFile(path.join(contentDir, 'guidance', '_harnesses', 'claude', 'CLAUDE.md'), '# Claude\n', 'utf8');
    await writeFile(path.join(contentDir, 'subagents', '_data', 'claude.yaml'), '_defaults: {}\n', 'utf8');

    const shared = options.shared ?? { 'AGENTS.md': '# Shared\n' };
    for (const [name, body] of Object.entries(shared)) {
      await writeFile(path.join(contentDir, 'guidance', 'shared', name), body, 'utf8');
    }
    const scripts = options.scripts ?? {};
    for (const [name, body] of Object.entries(scripts)) {
      await writeFile(path.join(contentDir, 'scripts', name), body, 'utf8');
    }
    const supportDirs = options.supportDirs ?? {};
    for (const [dirName, files] of Object.entries(supportDirs)) {
      const supportDir = path.join(contentDir, 'skills', dirName);
      await mkdir(supportDir, { recursive: true });
      for (const [fileName, body] of Object.entries(files)) {
        const fullPath = path.join(supportDir, fileName);
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, body, 'utf8');
      }
    }

    return contentDir;
  }

  // endregion | Helpers
});
