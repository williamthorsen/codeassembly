import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findInjectionPlacementDefects } from '../injection-placement.ts';
import { buildRuleContext, createTempRoot, removeTempRoot, writeFileAt } from '../test-utils/rule-fixture.ts';

describe(findInjectionPlacementDefects, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('injection-placement');
    await writeFileAt(root, 'skills/_partials/section.md', '## Injected\n\nText.\n');
  });

  afterEach(async () => {
    await removeTempRoot(root);
  });

  it('reports a host heading deeper than the partial that the include before it injects', async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '# Alpha\n\n<!-- include: ../_partials/section.md / -->\n\n### Host section\n',
    );

    const defects = await findInjectionPlacementDefects(buildRuleContext(root));

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'skills/alpha/SKILL.md', kind: 'heading' });
    expect(defects[0]?.detail).toContain('Line 3');
    expect(defects[0]?.detail).toContain('line 5');
    expect(defects[0]?.detail).toContain('h2');
  });

  it('passes a host heading at the level of the injected content', async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '# Alpha\n\n<!-- include: ../_partials/section.md / -->\n\n## Host section\n',
    );

    expect(await findInjectionPlacementDefects(buildRuleContext(root))).toEqual([]);
  });

  it('reports a host heading deeper than the fill level after a guidance-hook directive', async () => {
    await writeFileAt(root, 'subagents/helper.md', '# Helper\n\n<!-- guidance-hook: preferences -->\n\n### Host\n');

    const defects = await findInjectionPlacementDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.file)).toEqual(['subagents/helper.md']);
    expect(defects[0]?.detail).toContain('h2');
  });

  it('ignores a directive inside a fence', async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '# Alpha\n\n```markdown\n<!-- include: ../_partials/section.md / -->\n```\n\n### Host section\n',
    );

    expect(await findInjectionPlacementDefects(buildRuleContext(root))).toEqual([]);
  });

  it('ignores slot content between an open include and its close', async () => {
    await writeFileAt(root, 'skills/_partials/wrapper.md', 'Before.\n\n<!-- children -->\n\nAfter.\n');
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '# Alpha\n\n## Section\n\n<!-- include: ../_partials/wrapper.md -->\n#### Slot heading\n<!-- /include -->\n',
    );

    expect(await findInjectionPlacementDefects(buildRuleContext(root))).toEqual([]);
  });

  it('reports a partial that fails to expand rather than throwing', async () => {
    await writeFileAt(root, 'skills/alpha/SKILL.md', '# Alpha\n\n<!-- include: ../_partials/absent.md / -->\n');

    const defects = await findInjectionPlacementDefects(buildRuleContext(root));

    expect(defects).toEqual([expect.objectContaining({ file: 'skills/alpha/SKILL.md', kind: 'heading' })]);
  });
});
