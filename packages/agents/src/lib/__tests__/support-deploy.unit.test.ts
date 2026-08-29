import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSkillLinkAnchor } from '../link-anchor.ts';
import type { SkillDeployContext } from '../skill-transform.ts';
import {
  deploySourceSupport,
  listUndeclaredSourceSupport,
  renderSourceSupport,
  retractUndeclaredSourceSupport,
} from '../support-deploy.ts';

describe('source support delivery', () => {
  let sourceDir: string;
  let destParent: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sourceDir = path.join(tmpdir(), `agents-test-support-src-${stamp}`);
    destParent = path.join(tmpdir(), `agents-test-support-dest-${stamp}`);
    await mkdir(destParent, { recursive: true });
  });

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(destParent, { recursive: true, force: true });
  });

  describe(renderSourceSupport, () => {
    it('renders a support directory, anchoring its links in the source namespace', async () => {
      await writeSupportFile('_data/house-style.md', 'See [concision](./concision.md).\n');
      await writeSupportFile('_data/concision.md', '# Concision\n');

      const entries = await renderSourceSupport(sourceDir, context());

      const houseStyle = entries.find((entry) => entry.relPath === '_data/house-style.md');
      expect(houseStyle?.kind).toBe('markdown');
      expect(houseStyle?.kind === 'markdown' && houseStyle.content).toContain(
        '[concision](~/.claude/skills/_sources/org/_data/concision.md)',
      );
    });

    it('renders a Markdown file support entry, anchoring its links in the source namespace', async () => {
      await writeSupportFile('glossary.md', 'See [the house style](_data/house-style.md), then run {skill:commit}.\n');
      await writeSupportFile('_data/house-style.md', '# House style\n');

      const entries = await renderSourceSupport(sourceDir, context());

      const glossary = entries.find((entry) => entry.relPath === 'glossary.md');
      expect(glossary?.kind === 'markdown' && glossary.content).toBe(
        'See [the house style](~/.claude/skills/_sources/org/_data/house-style.md), then run /commit.\n',
      );
    });

    it('rewrites tool placeholders and template variables in support content', async () => {
      await writeSupportFile('_data/tools.md', 'Use {tool:Read}; run `{harness_home_dir}/scripts/x.sh`.\n');

      const entries = await renderSourceSupport(sourceDir, context());

      const rendered = entries.find((entry) => entry.relPath === '_data/tools.md');
      expect(rendered?.kind === 'markdown' && rendered.content).toContain('Use Read;');
      expect(rendered?.kind === 'markdown' && rendered.content).toContain('~/.claude/scripts/x.sh');
    });

    it('carries a non-Markdown support file as a verbatim asset', async () => {
      await writeSupportFile('_data/work-types.json', '{"types":[]}\n');

      const entries = await renderSourceSupport(sourceDir, context());

      expect(entries).toContainEqual(expect.objectContaining({ kind: 'asset', relPath: '_data/work-types.json' }));
    });

    it('skips skill directories, which deploy on their own', async () => {
      await writeSupportFile('commit/SKILL.md', '---\nname: commit\n---\n\n# Commit\n');
      await writeSupportFile('_data/x.md', '# X\n');

      const entries = await renderSourceSupport(sourceDir, context());

      expect(entries.map((entry) => entry.relPath)).toEqual(['_data/x.md']);
    });

    it('renders nothing for a source that ships no skills directory', async () => {
      await mkdir(sourceDir, { recursive: true });

      expect(await renderSourceSupport(sourceDir, context())).toEqual([]);
    });
  });

  describe(deploySourceSupport, () => {
    it('writes the rendered tree into the source namespace directory', async () => {
      await writeSupportFile('_data/house-style.md', '# House style\n');
      const destDir = path.join(destParent, 'org');

      await deploySourceSupport(destDir, await renderSourceSupport(sourceDir, context()));

      expect(await readFile(path.join(destDir, '_data', 'house-style.md'), 'utf8')).toContain('# House style');
    });

    it('prunes a support file the source no longer carries', async () => {
      await writeSupportFile('_data/keep.md', '# Keep\n');
      await writeSupportFile('_data/drop.md', '# Drop\n');
      const destDir = path.join(destParent, 'org');
      await deploySourceSupport(destDir, await renderSourceSupport(sourceDir, context()));

      await rm(path.join(sourceDir, 'skills', '_data', 'drop.md'));
      await deploySourceSupport(destDir, await renderSourceSupport(sourceDir, context()));

      expect(existsSync(path.join(destDir, '_data', 'keep.md'))).toBe(true);
      expect(existsSync(path.join(destDir, '_data', 'drop.md'))).toBe(false);
    });

    it('retires the namespace directory when the source drops its last support entry', async () => {
      await writeSupportFile('_data/only.md', '# Only\n');
      const destDir = path.join(destParent, 'org');
      await deploySourceSupport(destDir, await renderSourceSupport(sourceDir, context()));

      await rm(path.join(sourceDir, 'skills', '_data'), { recursive: true });
      await deploySourceSupport(destDir, await renderSourceSupport(sourceDir, context()));

      expect(existsSync(destDir)).toBe(false);
    });
  });

  describe(retractUndeclaredSourceSupport, () => {
    it('removes a namespace no declared source claims and keeps the ones that remain', async () => {
      await mkdir(path.join(destParent, 'kept', '_data'), { recursive: true });
      await writeFile(path.join(destParent, 'kept', '_data', 'a.md'), '# A\n', 'utf8');
      await mkdir(path.join(destParent, 'dropped', '_data'), { recursive: true });
      await writeFile(path.join(destParent, 'dropped', '_data', 'b.md'), '# B\n', 'utf8');

      await retractUndeclaredSourceSupport(destParent, { surviving: ['kept'], emptied: [] });

      expect(existsSync(path.join(destParent, 'kept', '_data', 'a.md'))).toBe(true);
      expect(existsSync(path.join(destParent, 'dropped'))).toBe(false);
    });

    it('keeps a scoped package name, which nests as its own segments', async () => {
      await mkdir(path.join(destParent, '@williamthorsen', 'nmr', '_data'), { recursive: true });
      await writeFile(path.join(destParent, '@williamthorsen', 'nmr', '_data', 'a.md'), '# A\n', 'utf8');
      await mkdir(path.join(destParent, '@williamthorsen', 'other'), { recursive: true });

      await retractUndeclaredSourceSupport(destParent, { surviving: ['@williamthorsen/nmr'], emptied: [] });

      expect(existsSync(path.join(destParent, '@williamthorsen', 'nmr', '_data', 'a.md'))).toBe(true);
      expect(existsSync(path.join(destParent, '@williamthorsen', 'other'))).toBe(false);
    });

    it('removes a scope directory left holding no declared package', async () => {
      await mkdir(path.join(destParent, '@williamthorsen', 'nmr'), { recursive: true });
      await mkdir(path.join(destParent, 'org', '_data'), { recursive: true });
      await writeFile(path.join(destParent, 'org', '_data', 'a.md'), '# A\n', 'utf8');
      // The scope's only package dropped its last support entry, so delivery already removed the package directory.
      await rm(path.join(destParent, '@williamthorsen', 'nmr'), { recursive: true });

      await retractUndeclaredSourceSupport(destParent, { surviving: ['org'], emptied: ['@williamthorsen/nmr'] });

      expect(existsSync(path.join(destParent, '@williamthorsen'))).toBe(false);
      expect(existsSync(path.join(destParent, 'org', '_data', 'a.md'))).toBe(true);
    });

    it('removes the root once no source claims anything under it', async () => {
      await mkdir(path.join(destParent, 'dropped'), { recursive: true });

      await retractUndeclaredSourceSupport(destParent, { surviving: [], emptied: [] });

      expect(existsSync(destParent)).toBe(false);
    });

    it('treats a missing root as nothing to do', async () => {
      const absent = path.join(destParent, 'never-created');

      await expect(
        retractUndeclaredSourceSupport(absent, { surviving: ['org'], emptied: [] }),
      ).resolves.toBeUndefined();
    });
  });

  describe(listUndeclaredSourceSupport, () => {
    it('names a dropped namespace without naming what removing it already covers', async () => {
      await mkdir(path.join(destParent, 'dropped', '_data'), { recursive: true });
      await writeFile(path.join(destParent, 'dropped', '_data', 'b.md'), '# B\n', 'utf8');
      await mkdir(path.join(destParent, 'kept'), { recursive: true });

      expect(await listUndeclaredSourceSupport(destParent, { surviving: ['kept'], emptied: [] })).toEqual([
        path.join(destParent, 'dropped'),
      ]);
    });

    it('names the root alone when nothing under it survives', async () => {
      await mkdir(path.join(destParent, 'dropped'), { recursive: true });

      expect(await listUndeclaredSourceSupport(destParent, { surviving: [], emptied: [] })).toEqual([destParent]);
    });

    it('names nothing for a missing root', async () => {
      expect(
        await listUndeclaredSourceSupport(path.join(destParent, 'absent'), { surviving: ['org'], emptied: [] }),
      ).toEqual([]);
    });

    it('keeps the root for a surviving source delivery has yet to create', async () => {
      await mkdir(path.join(destParent, 'old'), { recursive: true });

      expect(await listUndeclaredSourceSupport(destParent, { surviving: ['new'], emptied: [] })).toEqual([
        path.join(destParent, 'old'),
      ]);
    });

    it('keeps a scope directory for a surviving package delivery has yet to create', async () => {
      await mkdir(path.join(destParent, '@acme', 'stale'), { recursive: true });

      expect(await listUndeclaredSourceSupport(destParent, { surviving: ['@acme/fresh'], emptied: [] })).toEqual([
        path.join(destParent, '@acme', 'stale'),
      ]);
    });

    it('leaves a namespace delivery empties to delivery, claiming neither the removal nor the directory', async () => {
      await mkdir(path.join(destParent, 'emptied'), { recursive: true });
      await mkdir(path.join(destParent, 'kept'), { recursive: true });

      expect(await listUndeclaredSourceSupport(destParent, { surviving: ['kept'], emptied: ['emptied'] })).toEqual([]);
    });

    it('names a scope directory whose only package delivery empties', async () => {
      await mkdir(path.join(destParent, '@acme', 'gone'), { recursive: true });
      await mkdir(path.join(destParent, 'kept'), { recursive: true });

      expect(await listUndeclaredSourceSupport(destParent, { surviving: ['kept'], emptied: ['@acme/gone'] })).toEqual([
        path.join(destParent, '@acme'),
      ]);
    });
  });

  // region | Helpers

  function context(): SkillDeployContext {
    return {
      anchor: createSkillLinkAnchor({
        supportNamespace: 'org',
        domainBase: '~',
        homeDir: '.claude',
        skillsDirName: 'skills',
        deployedSkillDirs: new Set(),
      }),
      guidanceFileName: 'CLAUDE.md',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
    };
  }

  /** Writes a file under the source's `skills/` directory, creating parents as needed. */
  async function writeSupportFile(relPath: string, content: string): Promise<void> {
    const full = path.join(sourceDir, 'skills', relPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }

  // endregion | Helpers
});
