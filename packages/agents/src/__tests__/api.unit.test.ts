import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  HARNESS_IDS,
  listCatalog,
  readArtifact,
  renderContentRoot,
  resolveClosure,
  validateContentRoot,
} from '../api.ts';

describe('content API', () => {
  let root: string;

  beforeEach(async () => {
    root = path.join(tmpdir(), `agents-test-api-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('HARNESS_IDS', () => {
    it('lists every supported harness', () => {
      expect(HARNESS_IDS).toEqual(['claude', 'rovo']);
    });
  });

  describe(listCatalog, () => {
    it('lists every artifact type, collections included', async () => {
      await writeSkill(root, 'alpha');
      await writeFileAt(root, 'subagents/helper.md', '---\nname: helper\ndescription: Helper.\n---\n');
      await writeRulebook(root, 'house-style');
      await writeFileAt(root, 'collections/starter.md', '---\nname: starter\nmembers:\n  skills:\n    - alpha\n---\n');

      expect(await listCatalog(root)).toEqual({
        collection: ['starter'],
        rulebook: ['house-style'],
        skill: ['alpha'],
        subagent: ['helper'],
      });
    });
  });

  describe(readArtifact, () => {
    it('returns the parsed frontmatter and the include-expanded file', async () => {
      await writeFileAt(root, '_partials/shared.md', 'Shared text.\n');
      await writeSkill(root, 'alpha', 'Before.\n\n<!-- include: ../../_partials/shared.md / -->\n');

      const artifact = await readArtifact(root, 'skill', 'alpha');

      expect(artifact.frontmatter).toEqual({ name: 'alpha', description: 'alpha fixture skill' });
      expect(artifact.body).toMatch(/^---\nname: alpha\n/);
      expect(artifact.body).toContain('Shared text.');
    });
  });

  describe(resolveClosure, () => {
    it('follows dependency edges from the seeds', async () => {
      await writeFileAt(
        root,
        'skills/alpha/SKILL.md',
        '---\nname: alpha\ndescription: Alpha.\ndependencies:\n  rulebooks:\n    - house-style\n---\n',
      );
      await writeRulebook(root, 'house-style');

      expect(await resolveClosure(root, { skill: ['alpha'] })).toEqual({
        collection: [],
        rulebook: ['house-style'],
        skill: ['alpha'],
        subagent: [],
      });
    });
  });

  describe(renderContentRoot, () => {
    it('keys each deployed file by its harness-home path, with Markdown frontmatter parsed', async () => {
      await writeSkill(root, 'alpha');

      const tree = await renderContentRoot(root, { harness: 'claude' });

      expect(tree['skills/alpha/SKILL.md']?.frontmatter).toEqual({ name: 'alpha', description: 'alpha fixture skill' });
      expect(tree['skills/alpha/SKILL.md']?.body).toContain('<!-- codeassembly-skill:alpha -->');
    });

    it('fills a declared guidance hook from its bindings', async () => {
      await writeSkill(root, 'alpha', '<!-- guidance-hook: style -->\n');
      await writeRulebook(root, 'house-style', 'hook', 'Use plain words.');

      const tree = await renderContentRoot(root, { harness: 'rovo', guidanceHooks: { style: ['house-style'] } });

      expect(tree['skills/alpha/SKILL.md']?.body).toContain('Use plain words.');
    });

    it('throws one error naming every file that failed', async () => {
      await writeSkill(root, 'alpha', 'Run {tool:Nope}.\n');
      await writeSkill(root, 'beta', 'See [nothing](#nowhere).\n');

      const rendering = renderContentRoot(root, { harness: 'claude' });

      await expect(rendering).rejects.toThrow(path.join('skills', 'alpha', 'SKILL.md'));
      await expect(rendering).rejects.toThrow(path.join('skills', 'beta', 'SKILL.md'));
    });
  });

  describe(validateContentRoot, () => {
    it('returns the defects that validate reports', async () => {
      await writeSkill(root, 'alpha', 'Run {tool:Nope}.\n');

      const defects = await validateContentRoot(root, HARNESS_IDS);

      expect(defects).toEqual([
        expect.objectContaining({ file: path.join('skills', 'alpha', 'SKILL.md'), kind: 'render' }),
      ]);
    });

    it('returns an empty list for a sound root', async () => {
      await writeSkill(root, 'alpha');

      expect(await validateContentRoot(root, HARNESS_IDS)).toEqual([]);
    });
  });
});

// region | Helpers

/** Writes `content` at `relPath` under `root`, creating its directories. */
async function writeFileAt(root: string, relPath: string, content: string): Promise<void> {
  const filePath = path.join(root, relPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

/** Writes a rulebook delivered through `delivery`. */
async function writeRulebook(root: string, slug: string, delivery = 'ambient', body = 'Body.'): Promise<void> {
  await writeFileAt(
    root,
    `guidance/rulebooks/${slug}.md`,
    `---\nslug: ${slug}\ndescription: ${slug} fixture rulebook\ndelivery: ${delivery}\n---\n\n# ${slug}\n\n${body}\n`,
  );
}

/** Writes a skill whose body follows its heading. */
async function writeSkill(root: string, slug: string, body = 'Body.\n'): Promise<void> {
  await writeFileAt(
    root,
    `skills/${slug}/SKILL.md`,
    `---\nname: ${slug}\ndescription: ${slug} fixture skill\n---\n\n# ${slug}\n\n${body}`,
  );
}

// endregion | Helpers
