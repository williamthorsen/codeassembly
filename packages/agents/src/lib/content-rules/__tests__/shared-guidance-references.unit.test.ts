import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectSkillReferences, findSharedGuidanceReferenceDefects } from '../shared-guidance-references.ts';
import { buildRuleContext, createTempRoot, removeTempRoot, writeFileAt } from '../test-utils/rule-fixture.ts';

describe(findSharedGuidanceReferenceDefects, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('shared-guidance-references');
    await writeFileAt(root, 'skills/universal/SKILL.md', '---\nname: universal\ndescription: Fixture.\n---\n');
    await writeFileAt(
      root,
      'skills/narrowed/SKILL.md',
      '---\nname: narrowed\ndescription: Fixture.\nsupported-harnesses:\n  - claude\n---\n',
    );
  });

  afterEach(async () => {
    await removeTempRoot(root);
  });

  it('reports a skill that the content root does not contain, naming its line', async () => {
    await writeShared('# Style\n\nFormat per the `no-such-skill` skill.\n');

    const defects = await findSharedGuidanceReferenceDefects(buildRuleContext(root));

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'guidance/shared/style.md', kind: 'reference' });
    expect(defects[0]?.detail).toContain('Line 3');
    expect(defects[0]?.detail).toContain('no-such-skill');
  });

  it('reports a skill narrowed to some harnesses', async () => {
    await writeShared('See the skill `narrowed`.\n');

    const defects = await findSharedGuidanceReferenceDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.detail)).toEqual([expect.stringContaining('deploys only to claude')]);
  });

  it('passes a skill that the root contains and that deploys to every harness', async () => {
    await writeShared('Use the `universal` skill.\n');

    expect(await findSharedGuidanceReferenceDefects(buildRuleContext(root))).toEqual([]);
  });

  it('passes a name under which a skill-delivery rulebook deploys', async () => {
    await writeFileAt(
      root,
      'guidance/rulebooks/shell.md',
      '---\nslug: shell\ndescription: Fixture.\ndelivery: skill\nskill-name: consult-shell\n---\n\n# Shell\n',
    );
    await writeShared('Consult the `consult-shell` skill.\n');

    expect(await findSharedGuidanceReferenceDefects(buildRuleContext(root))).toEqual([]);
  });

  it('reports a name under which a rulebook narrowed to some harnesses deploys', async () => {
    await writeFileAt(
      root,
      'guidance/rulebooks/claude-models.md',
      '---\nslug: claude-models\ndescription: Fixture.\ndelivery: skill\nsupported-harnesses: claude\n---\n\n# Models\n',
    );
    await writeShared('Consult the `consult-claude-models` skill.\n');

    const defects = await findSharedGuidanceReferenceDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.detail)).toEqual([
      expect.stringContaining('`consult-claude-models`, which deploys only to claude'),
    ]);
  });

  it('ignores a backticked identifier that is not adjacent to the word "skill"', async () => {
    await writeShared('Name functions with a leading verb (`show_usage`, not `usage`).\n');

    expect(await findSharedGuidanceReferenceDefects(buildRuleContext(root))).toEqual([]);
  });

  /** Writes `guidance/shared/style.md` under the fixture root. */
  async function writeShared(body: string): Promise<void> {
    await writeFileAt(root, 'guidance/shared/style.md', body);
  }
});

describe(collectSkillReferences, () => {
  it.each([
    ['name before the word', 'Title: 72 chars max. Format per `git-commit-conventions` skill.'],
    ['name after the word', 'See the skill `git-commit-conventions` for the full format.'],
  ])('extracts a skill named with the %s', (_form, line) => {
    expect([...collectSkillReferences(line)]).toEqual(['git-commit-conventions']);
  });
});
