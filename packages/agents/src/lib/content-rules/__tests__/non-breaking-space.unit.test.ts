import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findNonBreakingSpaceDefects } from '../non-breaking-space.ts';
import { buildRuleContext, createTempRoot, removeTempRoot, writeFileAt } from '../test-utils/rule-fixture.ts';

describe(findNonBreakingSpaceDefects, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('nbsp');
  });

  afterEach(async () => {
    await removeTempRoot(root);
  });

  it('reports each line containing a non-breaking space, naming its line number', async () => {
    await writeFileAt(root, 'skills/alpha/SKILL.md', '# Alpha\n\n1. Option:\n\u{A0}\u{A0}\u{A0}reason\n');

    const defects = await findNonBreakingSpaceDefects(buildRuleContext(root));

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'skills/alpha/SKILL.md', kind: 'codepoint' });
    expect(defects[0]?.detail).toContain('Line 4');
  });

  it('reads every authored extension', async () => {
    for (const name of ['data.json', 'run.sh', 'helper.ts', 'config.yaml']) {
      await writeFileAt(root, `scripts/${name}`, 'a\u{A0}b\n');
    }

    const defects = await findNonBreakingSpaceDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.file)).toEqual([
      'scripts/config.yaml',
      'scripts/data.json',
      'scripts/helper.ts',
      'scripts/run.sh',
    ]);
  });

  // The UTF-8 encodings of both characters contain the byte 0xA0, which a byte-level scan would report.
  it('passes characters whose encoding contains the byte 0xA0', async () => {
    await writeFileAt(root, 'skills/alpha/SKILL.md', '1. ■■■ Option:\n   - ➕ reason\n');

    expect(await findNonBreakingSpaceDefects(buildRuleContext(root))).toEqual([]);
  });

  it('does not read a build-written bundle or the test tree', async () => {
    await writeFileAt(root, 'skills/alpha/helper.mjs', 'a\u{A0}b\n');
    await writeFileAt(root, 'skills/alpha/__tests__/fixture.md', 'a\u{A0}b\n');

    expect(await findNonBreakingSpaceDefects(buildRuleContext(root))).toEqual([]);
  });
});
