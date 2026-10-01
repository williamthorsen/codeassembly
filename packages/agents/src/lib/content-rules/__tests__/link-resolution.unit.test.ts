import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findLinkResolutionDefects } from '../link-resolution.ts';
import { buildRuleContext, createTempRoot, removeTempRoot, writeFileAt } from '../test-utils/rule-fixture.ts';

describe(findLinkResolutionDefects, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('link-resolution');
    await writeFileAt(root, 'skills/_data/notes.md', '# Notes\n\n## Unique\n\n## Twice\n\n## Twice\n');
  });

  afterEach(async () => {
    await removeTempRoot(root);
  });

  it('reports a link to a file that the content root does not contain', async () => {
    await writeSkillBody('See [the gone file](../_data/gone.md).');

    const defects = await findLinkResolutionDefects(buildRuleContext(root));

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'skills/alpha/SKILL.md', kind: 'link' });
    expect(defects[0]?.detail).toContain('../_data/gone.md');
    expect(defects[0]?.detail).toContain('not present in the content root');
  });

  it('passes a link to a file and a heading that both resolve', async () => {
    await writeSkillBody('See [unique](../_data/notes.md#unique) and [the file](../_data/notes.md).');

    expect(await findLinkResolutionDefects(buildRuleContext(root))).toEqual([]);
  });

  it('reports a fragment that names no heading in the target', async () => {
    await writeSkillBody('See [nothing](../_data/notes.md#absent).');

    const defects = await findLinkResolutionDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.detail)).toEqual([expect.stringContaining('does not name any heading')]);
  });

  it('reports a fragment that names several headings in the target', async () => {
    await writeSkillBody('See [twice](../_data/notes.md#twice).');

    const defects = await findLinkResolutionDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.detail)).toEqual([expect.stringContaining('names 2 headings')]);
  });

  it('skips a host with an open fence, whose links below the fence are not live', async () => {
    await writeSkillBody('```bash\nSee [the gone file](../_data/gone.md).\n');

    expect(await findLinkResolutionDefects(buildRuleContext(root))).toEqual([]);
  });

  it('resolves a link authored in a partial against the host that inlines it', async () => {
    await writeFileAt(root, 'skills/_partials/pointer.md', 'See [the gone file](../_data/gone.md).\n');
    await writeSkillBody('<!-- include: ../_partials/pointer.md / -->');

    const defects = await findLinkResolutionDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.file)).toEqual(['skills/alpha/SKILL.md']);
  });

  it('reads rulebooks, support entries, and subagents as hosts', async () => {
    await writeFileAt(root, 'guidance/rulebooks/style.md', '# Style\n\n[x](../../skills/_data/gone.md)\n');
    await writeFileAt(root, 'skills/_data/pointer.md', '# Pointer\n\n[x](gone.md)\n');
    await writeFileAt(root, 'subagents/helper.md', '# Helper\n\n[x](../skills/_data/gone.md)\n');

    const defects = await findLinkResolutionDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.file)).toEqual([
      'guidance/rulebooks/style.md',
      'skills/_data/pointer.md',
      'subagents/helper.md',
    ]);
  });

  it('leaves an anchor-only target to the render pass', async () => {
    await writeSkillBody('See [nothing](#absent).');

    expect(await findLinkResolutionDefects(buildRuleContext(root))).toEqual([]);
  });

  /** Writes the body of the `alpha` skill under the fixture root. */
  async function writeSkillBody(body: string): Promise<void> {
    await writeFileAt(root, 'skills/alpha/SKILL.md', `# Alpha\n\n${body}\n`);
  }
});
