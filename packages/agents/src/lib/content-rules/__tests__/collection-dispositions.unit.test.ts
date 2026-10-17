import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findCollectionDispositionDefects } from '../collection-dispositions.ts';
import { buildRuleContext, createTempRoot, removeTempRoot, writeFileAt } from '../test-utils/rule-fixture.ts';

describe(findCollectionDispositionDefects, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('dispositions');
  });

  afterEach(async () => {
    await removeTempRoot(root);
  });

  it('does not check a root that declares no disposition', async () => {
    await writeSkill(root, 'loose');
    await writeCollection(root, 'bundle', 'members:\n  skills:\n    - other');

    expect(await findDispositionDetails(root)).toEqual([]);
  });

  describe('coverage', () => {
    it('reports an artifact without a disposition in a root without an @unclaimed collection', async () => {
      await writeSkill(root, 'vetted');
      await writeSkill(root, 'orphan');
      await writeCollection(root, 'recommended', listMembers('public', ['vetted']));

      expect(await findDispositionDetails(root)).toEqual([
        'skill:orphan does not have a disposition; add it to a collection, or declare `standalone:` with the reason.',
      ]);
    });

    it('reports an artifact claimed only by a plain bundle', async () => {
      await writeSkill(root, 'vetted');
      await writeSkill(root, 'bundled');
      await writeCollection(root, 'recommended', listMembers('public', ['vetted']));
      await writeCollection(root, 'bundle', 'members:\n  skills:\n    - bundled');

      expect(await findDispositionDetails(root)).toEqual([
        'skill:bundled does not have a disposition; add it to a collection, or declare `standalone:` with the reason.',
      ]);
    });

    it('covers every artifact through an @unclaimed collection', async () => {
      await writeSkill(root, 'vetted');
      await writeSkill(root, 'unexamined');
      await writeCollection(root, 'recommended', listMembers('public', ['vetted']));
      await writeCollection(root, 'triage', "members: '@unclaimed'");

      expect(await findDispositionDetails(root)).toEqual([]);
    });

    it('accepts an artifact claimed by two dispositioned collections', async () => {
      await writeSkill(root, 'shared');
      await writeCollection(root, 'recommended', listMembers('public', ['shared']));
      await writeCollection(root, 'personal', listMembers('personal', ['shared']));

      expect(await findDispositionDetails(root)).toEqual([]);
    });

    it('reports a standalone artifact that a collection contains', async () => {
      await writeSkill(root, 'contested', 'standalone: rarely wanted');
      await writeCollection(root, 'bundle', 'members:\n  skills:\n    - contested');

      const defects = await findCollectionDispositionDefects(buildRuleContext(root));

      expect(defects).toEqual([
        {
          file: 'skills/contested/SKILL.md',
          kind: 'disposition',
          detail:
            'skill:contested declares standalone yet is claimed by bundle; standalone excludes membership in any collection.',
        },
      ]);
    });

    it('reports an unreadable disposition, naming its file', async () => {
      await writeSkill(root, 'vetted');
      await writeCollection(root, 'team', listMembers('vetted', ['vetted']));

      const defects = await findCollectionDispositionDefects(buildRuleContext(root));

      expect(defects).toContainEqual({
        file: 'collections/team.md',
        kind: 'disposition',
        detail: expect.stringContaining('"vetted"'),
      });
    });
  });

  describe('reach', () => {
    it('reports a public member reaching an unexamined artifact', async () => {
      await writeSkill(root, 'vetted', dependOn('unvetted'));
      await writeSkill(root, 'unvetted');
      await writeCollection(root, 'recommended', listMembers('public', ['vetted']));
      await writeCollection(root, 'triage', "members: '@unclaimed'");

      expect(await findDispositionDetails(root)).toEqual([
        "recommended's closure reaches skill:unvetted, whose disposition is triage; promote it or drop the edge.",
      ]);
    });

    it('reports a public member reaching a personal one, and lets a personal member reach a public one', async () => {
      await writeSkill(root, 'general', dependOn('mine'));
      await writeSkill(root, 'mine', dependOn('other-general'));
      await writeSkill(root, 'other-general');
      await writeCollection(root, 'recommended', listMembers('public', ['general', 'other-general']));
      await writeCollection(root, 'personal', listMembers('personal', ['mine']));

      expect(await findDispositionDetails(root)).toEqual([
        "recommended's closure reaches skill:mine, whose disposition is personal; promote it or drop the edge.",
      ]);
    });

    it('reports a reached artifact without any claim at all', async () => {
      await writeSkill(root, 'vetted', dependOn('unclaimed'));
      await writeSkill(root, 'unclaimed');
      await writeCollection(root, 'recommended', listMembers('public', ['vetted']));

      expect(await findDispositionDetails(root)).toContain(
        "recommended's closure reaches skill:unclaimed, which does not have a disposition; claim it or drop the edge.",
      );
    });

    it('reports any collection reaching a standalone artifact', async () => {
      await writeSkill(root, 'unexamined', dependOn('proof'));
      await writeSkill(root, 'proof', 'standalone: exercises a mechanism');
      await writeCollection(root, 'triage', "members: '@unclaimed'");

      expect(await findDispositionDetails(root)).toEqual([
        "triage's closure reaches skill:proof, which declares standalone; add it to a collection or drop the edge.",
      ]);
    });

    it('reports a collection reaching an opt-in member, including another opt-in collection', async () => {
      await writeSkill(root, 'host', dependOn('vendor'));
      await writeSkill(root, 'vendor');
      await writeSkill(root, 'other-vendor', dependOn('vendor'));
      await writeCollection(root, 'atlassian', listMembers('opt-in', ['vendor']));
      await writeCollection(root, 'github', listMembers('opt-in', ['other-vendor']));
      await writeCollection(root, 'triage', "members: '@unclaimed'");

      expect(await findDispositionDetails(root)).toEqual([
        "github's closure reaches skill:vendor, a member of the opt-in collection atlassian.",
        "triage's closure reaches skill:vendor, a member of the opt-in collection atlassian.",
      ]);
    });

    it('does not check an @library collection', async () => {
      await writeSkill(root, 'vendor');
      await writeCollection(root, 'atlassian', listMembers('opt-in', ['vendor']));
      await writeCollection(root, 'all', "members: '@library'");

      expect(await findDispositionDetails(root)).toEqual([]);
    });
  });
});

// region | Helpers

/** Renders a `dependencies:` block naming one skill. */
function dependOn(skill: string): string {
  return `dependencies:\n  skills:\n    - ${skill}`;
}

/** Runs the rule over `root` and returns each defect's detail. */
async function findDispositionDetails(root: string): Promise<Array<string>> {
  return (await findCollectionDispositionDefects(buildRuleContext(root))).map(({ detail }) => detail);
}

/** Renders a dispositioned collection's frontmatter enumerating `skills`. */
function listMembers(disposition: string, skills: ReadonlyArray<string>): string {
  return `disposition: ${disposition}\nmembers:\n  skills:\n${skills.map((skill) => `    - ${skill}`).join('\n')}`;
}

/** Writes a collection whose frontmatter, after its `name:`, is `frontmatter` verbatim. */
async function writeCollection(root: string, slug: string, frontmatter: string): Promise<void> {
  await writeFileAt(root, `collections/${slug}.md`, `---\nname: ${slug}\n${frontmatter}\n---\n\n# ${slug}\n`);
}

/** Writes a skill whose frontmatter, after its `name:` and `description:`, is `frontmatter` verbatim. */
async function writeSkill(root: string, slug: string, frontmatter = ''): Promise<void> {
  await writeFileAt(
    root,
    `skills/${slug}/SKILL.md`,
    `---\nname: ${slug}\ndescription: ${slug}\n${frontmatter}\n---\n\n# ${slug}\n`,
  );
}

// endregion | Helpers
