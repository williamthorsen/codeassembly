import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findScriptInvocationDefects, isInvocationContext } from '../script-invocation.ts';
import { buildRuleContext, createTempRoot, removeTempRoot, writeFileAt } from '../test-utils/rule-fixture.ts';

describe(findScriptInvocationDefects, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('script-invocation');
    await writeFileAt(root, 'scripts/run-check.sh', '#!/usr/bin/env bash\n');
    await writeFileAt(root, 'scripts/describe.mjs', '');
    await writeFileAt(root, 'scripts/README.md', '# Scripts\n');
  });

  afterEach(async () => {
    await removeTempRoot(root);
  });

  it('reports a bare invocation taking a flag, naming its line', async () => {
    await writeSkillBody('Run:\n\n```bash\nrun-check.sh --strict\n```\n');

    const defects = await findScriptInvocationDefects(buildRuleContext(root));

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'skills/alpha/SKILL.md', kind: 'invocation' });
    expect(defects[0]?.detail).toContain('Line 6');
    expect(defects[0]?.detail).toContain('run-check.sh --strict');
  });

  it('reports an invocation through an interpreter word, whatever follows the name', async () => {
    await writeSkillBody('node describe.mjs render-titles\n');

    const defects = await findScriptInvocationDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.file)).toEqual(['skills/alpha/SKILL.md']);
  });

  it('passes a backticked prose mention', async () => {
    await writeSkillBody('The `run-check.sh` script reports drift.\n');

    expect(await findScriptInvocationDefects(buildRuleContext(root))).toEqual([]);
  });

  it('passes the prefixed form', async () => {
    await writeSkillBody('node {harness_home_dir}/scripts/describe.mjs render-titles --title x\n');

    expect(await findScriptInvocationDefects(buildRuleContext(root))).toEqual([]);
  });

  it('reads subagents as well as skills', async () => {
    await writeFileAt(root, 'subagents/helper.md', '# Helper\n\nrun-check.sh | tail\n');

    const defects = await findScriptInvocationDefects(buildRuleContext(root));

    expect(defects.map((defect) => defect.file)).toEqual(['subagents/helper.md']);
  });

  it('recognizes a script that only the library ships', async () => {
    const library = await createTempRoot('script-invocation-library');
    try {
      await writeFileAt(library, 'scripts/lib-only.sh', '');
      await writeSkillBody('lib-only.sh --flag\n');

      const defects = await findScriptInvocationDefects(buildRuleContext(root, library));

      expect(defects.map((defect) => defect.detail)).toEqual([expect.stringContaining('`lib-only.sh`')]);
    } finally {
      await removeTempRoot(library);
    }
  });

  it('does not treat the scripts README as a script', async () => {
    await writeSkillBody('README.md --flag\n');

    expect(await findScriptInvocationDefects(buildRuleContext(root))).toEqual([]);
  });

  it('reports nothing when neither the root nor the library ships scripts', async () => {
    const bare = await createTempRoot('script-invocation-bare');
    try {
      await writeFileAt(bare, 'skills/alpha/SKILL.md', 'node describe.mjs --flag\n');

      expect(await findScriptInvocationDefects(buildRuleContext(bare))).toEqual([]);
    } finally {
      await removeTempRoot(bare);
    }
  });

  /** Writes the body of the `alpha` skill under the fixture root. */
  async function writeSkillBody(body: string): Promise<void> {
    await writeFileAt(root, path.join('skills', 'alpha', 'SKILL.md'), `# Alpha\n\n${body}`);
  }
});

describe(isInvocationContext, () => {
  it.each([
    ['a CLI flag', '', ' --skill orchestrate --interactive false'],
    ['a line continuation', '', ' \\'],
    ['a shell operator', '', ' | grep foo'],
    ['an interpreter word', 'node ', ' render-titles --title foo'],
    ['an interpreter word taking positionals', 'bash ', ' commit subject'],
    ['a backticked interpreter invocation', 'Run `node ', '`.'],
  ])('flags %s', (_case, before, after) => {
    expect(isInvocationContext(before, after)).toBe(true);
  });

  it.each([
    ['a closing-backtick prose mention', 'The `', '`'],
    ['a prose follow-on word', 'the ', ' script renders'],
    ['punctuation-terminated prose', 'see ', '.'],
    ['a word that only ends with an interpreter name', 'decode ', ' output'],
  ])('does not flag %s', (_case, before, after) => {
    expect(isInvocationContext(before, after)).toBe(false);
  });
});
