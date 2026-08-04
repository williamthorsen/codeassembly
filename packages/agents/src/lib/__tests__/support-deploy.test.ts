import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSkillLinkAnchor } from '../link-anchor.ts';
import type { SkillDeployContext } from '../skill-transform.ts';
import { deploySourceSupport, renderSourceSupport, retractUndeclaredSourceSupport } from '../support-deploy.ts';

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

    it('rewrites tool placeholders and template variables in support content', async () => {
      await writeSupportFile('_data/tools.md', 'Use {tool:Read}; run `{harness_home_dir}/scripts/x.sh`.\n');

      const entries = await renderSourceSupport(sourceDir, context(new Map([['Read', 'open_files']])));

      const rendered = entries.find((entry) => entry.relPath === '_data/tools.md');
      expect(rendered?.kind === 'markdown' && rendered.content).toContain('Use open_files;');
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

      await deploySourceSupport(sourceDir, destDir, context());

      expect(await readFile(path.join(destDir, '_data', 'house-style.md'), 'utf8')).toContain('# House style');
    });

    it('prunes a support file the source no longer carries', async () => {
      await writeSupportFile('_data/keep.md', '# Keep\n');
      await writeSupportFile('_data/drop.md', '# Drop\n');
      const destDir = path.join(destParent, 'org');
      await deploySourceSupport(sourceDir, destDir, context());

      await rm(path.join(sourceDir, 'skills', '_data', 'drop.md'));
      await deploySourceSupport(sourceDir, destDir, context());

      expect(existsSync(path.join(destDir, '_data', 'keep.md'))).toBe(true);
      expect(existsSync(path.join(destDir, '_data', 'drop.md'))).toBe(false);
    });

    it('retires the namespace directory when the source drops its last support entry', async () => {
      await writeSupportFile('_data/only.md', '# Only\n');
      const destDir = path.join(destParent, 'org');
      await deploySourceSupport(sourceDir, destDir, context());

      await rm(path.join(sourceDir, 'skills', '_data'), { recursive: true });
      await deploySourceSupport(sourceDir, destDir, context());

      expect(existsSync(destDir)).toBe(false);
    });
  });

  describe(retractUndeclaredSourceSupport, () => {
    it('removes a namespace no declared source claims and keeps the ones that remain', async () => {
      await mkdir(path.join(destParent, 'kept', '_data'), { recursive: true });
      await writeFile(path.join(destParent, 'kept', '_data', 'a.md'), '# A\n', 'utf8');
      await mkdir(path.join(destParent, 'dropped', '_data'), { recursive: true });
      await writeFile(path.join(destParent, 'dropped', '_data', 'b.md'), '# B\n', 'utf8');

      await retractUndeclaredSourceSupport(destParent, ['kept']);

      expect(existsSync(path.join(destParent, 'kept', '_data', 'a.md'))).toBe(true);
      expect(existsSync(path.join(destParent, 'dropped'))).toBe(false);
    });

    it('keeps a scoped package name, which nests as its own segments', async () => {
      await mkdir(path.join(destParent, '@williamthorsen', 'nmr', '_data'), { recursive: true });
      await writeFile(path.join(destParent, '@williamthorsen', 'nmr', '_data', 'a.md'), '# A\n', 'utf8');
      await mkdir(path.join(destParent, '@williamthorsen', 'other'), { recursive: true });

      await retractUndeclaredSourceSupport(destParent, ['@williamthorsen/nmr']);

      expect(existsSync(path.join(destParent, '@williamthorsen', 'nmr', '_data', 'a.md'))).toBe(true);
      expect(existsSync(path.join(destParent, '@williamthorsen', 'other'))).toBe(false);
    });

    it('removes the root once no source claims anything under it', async () => {
      await mkdir(path.join(destParent, 'dropped'), { recursive: true });

      await retractUndeclaredSourceSupport(destParent, []);

      expect(existsSync(destParent)).toBe(false);
    });

    it('treats a missing root as nothing to do', async () => {
      const absent = path.join(destParent, 'never-created');

      await expect(retractUndeclaredSourceSupport(absent, ['org'])).resolves.toBeUndefined();
    });
  });

  // region | Helpers

  function context(toolMapping: ReadonlyMap<string, string> = new Map()): SkillDeployContext {
    return {
      toolMapping,
      anchor: createSkillLinkAnchor({
        supportNamespace: 'org',
        domainBase: '~',
        homeDir: '.claude',
        skillsDirName: 'skills',
        deployedSkillDirs: new Set(),
      }),
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
