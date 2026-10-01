import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findSupportEntryTokenDefects } from '../support-entry-tokens.ts';
import { buildRuleContext, createTempRoot, removeTempRoot, writeFileAt } from '../test-utils/rule-fixture.ts';

describe(findSupportEntryTokenDefects, () => {
  let root: string;
  let library: string;

  beforeEach(async () => {
    root = await createTempRoot('support-entry-tokens');
    library = await createTempRoot('support-entry-tokens-library');
    await writeSkill('target', '# Target\n');
  });

  afterEach(async () => {
    await removeTempRoot(root);
    await removeTempRoot(library);
  });

  describe('token resolution', () => {
    it('reports a required token naming an artifact that resolves nowhere, against the entry', async () => {
      await writeFileAt(root, 'skills/_data/entry.md', '# Entry\n\nDelegate to {subagent:no-such-agent}.\n');

      const defects = await findSupportEntryTokenDefects(buildRuleContext(root, library));

      expect(defects).toHaveLength(1);
      expect(defects[0]).toMatchObject({ file: 'skills/_data/entry.md', kind: 'dependency' });
      expect(defects[0]?.detail).toContain('Line 3 invokes {subagent:no-such-agent}');
    });

    it('reports an optional token naming an artifact that resolves nowhere', async () => {
      await writeFileAt(root, 'skills/notes.md', '# Notes\n\nOptionally run {skill?:no-such-skill}.\n');

      const defects = await findSupportEntryTokenDefects(buildRuleContext(root, library));

      expect(defects.map((defect) => defect.detail)).toEqual([expect.stringContaining('{skill?:no-such-skill}')]);
    });

    it('passes a token whose target only the library supplies', async () => {
      await writeFileAt(library, 'subagents/lib-agent.md', '---\nname: lib-agent\ndescription: Fixture.\n---\n');
      await writeFileAt(root, 'skills/_data/entry.md', '# Entry\n\nDelegate to {subagent:lib-agent}.\n');

      expect(await findSupportEntryTokenDefects(buildRuleContext(root, library))).toEqual([]);
    });
  });

  describe('host declarations', () => {
    beforeEach(async () => {
      await writeFileAt(
        root,
        'skills/_data/entry.md',
        '# Entry\n\n## The section\n\nDo the work through {skill:target}.\n',
      );
    });

    it('reports a host that links the section carrying a required token and declares none of it', async () => {
      await writeSkill('host', '# Host\n\nFollow [the section](../_data/entry.md#the-section).\n');

      const defects = await findSupportEntryTokenDefects(buildRuleContext(root, library));

      expect(defects).toHaveLength(1);
      expect(defects[0]).toMatchObject({ file: 'skills/host/SKILL.md', kind: 'dependency' });
      expect(defects[0]?.detail).toContain('skill:target');
    });

    it('reports a host that links an ancestor of the section carrying the token', async () => {
      await writeSkill('host', '# Host\n\nFollow [the entry](../_data/entry.md#entry).\n');

      const defects = await findSupportEntryTokenDefects(buildRuleContext(root, library));

      expect(defects.map((defect) => defect.file)).toEqual(['skills/host/SKILL.md']);
    });

    it('accepts a host that declares the target', async () => {
      await writeSkill('host', '# Host\n\nFollow [the section](../_data/entry.md#the-section).\n', ['target']);

      expect(await findSupportEntryTokenDefects(buildRuleContext(root, library))).toEqual([]);
    });

    it('does not carry a requirement for a bare link to the file', async () => {
      await writeSkill('host', '# Host\n\nRead [the entry](../_data/entry.md).\n');

      expect(await findSupportEntryTokenDefects(buildRuleContext(root, library))).toEqual([]);
    });

    it('does not carry a requirement for an optional token', async () => {
      await writeFileAt(
        root,
        'skills/_data/entry.md',
        '# Entry\n\n## The section\n\nOptionally run {skill?:target}.\n',
      );
      await writeSkill('host', '# Host\n\nFollow [the section](../_data/entry.md#the-section).\n');

      expect(await findSupportEntryTokenDefects(buildRuleContext(root, library))).toEqual([]);
    });
  });

  describe('host declarations for a library support entry', () => {
    beforeEach(async () => {
      await writeFileAt(
        library,
        'skills/_data/shared.md',
        '# Shared\n\n## The section\n\nDo the work through {skill:target}.\n',
      );
    });

    it('reports a root host that links the library section carrying a required token and declares none of it', async () => {
      await writeSkill('host', '# Host\n\nFollow [the section](../_data/shared.md#the-section).\n');

      const defects = await findSupportEntryTokenDefects(buildRuleContext(root, library));

      expect(defects).toHaveLength(1);
      expect(defects[0]).toMatchObject({ file: 'skills/host/SKILL.md', kind: 'dependency' });
      expect(defects[0]?.detail).toContain('skill:target');
    });

    it('accepts a root host that declares the target', async () => {
      await writeSkill('host', '# Host\n\nFollow [the section](../_data/shared.md#the-section).\n', ['target']);

      expect(await findSupportEntryTokenDefects(buildRuleContext(root, library))).toEqual([]);
    });

    it('reads the root entry rather than the library one when both exist at the path', async () => {
      await writeFileAt(root, 'skills/_data/shared.md', '# Shared\n\n## The section\n\nDo the work by hand.\n');
      await writeSkill('host', '# Host\n\nFollow [the section](../_data/shared.md#the-section).\n');

      expect(await findSupportEntryTokenDefects(buildRuleContext(root, library))).toEqual([]);
    });
  });

  /** Writes a skill under the fixture root, optionally declaring skill dependencies. */
  async function writeSkill(slug: string, body: string, dependencies: ReadonlyArray<string> = []): Promise<void> {
    const declared =
      dependencies.length === 0 ? [] : ['dependencies:', '  skills:', ...dependencies.map((d) => `    - ${d}`)];
    const frontmatter = ['---', `name: ${slug}`, 'description: Fixture.', ...declared, '---'].join('\n');
    await writeFileAt(root, `skills/${slug}/SKILL.md`, `${frontmatter}\n\n${body}`);
  }
});
