import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findSharedGuidanceLinkDefects } from '../shared-guidance-links.ts';
import { buildRuleContext, createTempRoot, removeTempRoot, writeFileAt } from '../test-utils/rule-fixture.ts';

describe(findSharedGuidanceLinkDefects, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('shared-guidance-links');
  });

  afterEach(async () => {
    await removeTempRoot(root);
  });

  it('reports a bare-relative link target', async () => {
    await writeFileAt(root, 'guidance/shared/style.md', '# Style\n\nSee [the notes](../notes.md).\n');

    const defects = await findSharedGuidanceLinkDefects(buildRuleContext(root));

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'guidance/shared/style.md', kind: 'link' });
    expect(defects[0]?.detail).toContain('../notes.md');
  });

  it.each(['~/.claude/skills/_data/notes.md', '/etc/notes.md', '#style', 'https://example.com/notes'])(
    'passes the place-independent target %s',
    async (target) => {
      await writeFileAt(root, 'guidance/shared/style.md', `# Style\n\nSee [the notes](${target}).\n`);

      expect(await findSharedGuidanceLinkDefects(buildRuleContext(root))).toEqual([]);
    },
  );

  it('reports a link that an inlined partial contributes, against the shared file', async () => {
    await writeFileAt(root, 'guidance/_partials/pointer.md', 'See [the notes](notes.md).\n');
    await writeFileAt(root, 'guidance/shared/style.md', '# Style\n\n<!-- include: ../_partials/pointer.md / -->\n');

    const defects = await findSharedGuidanceLinkDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.file)).toEqual(['guidance/shared/style.md']);
  });
});
