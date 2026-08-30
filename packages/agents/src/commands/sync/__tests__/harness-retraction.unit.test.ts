import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ResolvedHarnessTargets } from '../../../lib/target-harnesses.ts';
import { planDroppedHarnessRetractions, retractDroppedHarnesses } from '../harness-retraction.ts';
import {
  scaffoldHarnessTree,
  writeDeclaredSkill,
  writeForeignSkill,
  writeForeignSubagent,
  writeRulebookSkill,
  writeSourceSupport,
  writeSubagent,
} from '../test-utils/harness-tree.ts';

const AMBIENT_REGION = '<!-- codeassembly-ambient:start -->\nambient guidance\n<!-- codeassembly-ambient:end -->';
const PROMPTS_REGION = '  # codeassembly:managed:start\n  - name: deployed\n  # codeassembly:managed:end';

/** Targets naming claude alone, declared, so rovo is the dropped harness in every case below. */
const CLAUDE_DECLARED: ResolvedHarnessTargets = { harnessIds: ['claude'], origin: 'declaration' };

describe(planDroppedHarnessRetractions, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = path.join(tmpdir(), `agents-test-retraction-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('names every surface the dropped harness holds', async () => {
    const { harnessHome, skillsDir, subagentsDir } = await scaffoldHarnessTree('rovo', baseDir);
    const rulebookSkill = await writeRulebookSkill(skillsDir, 'writing-prefs', 'writing-preferences');
    const declaredSkill = await writeDeclaredSkill(skillsDir, 'create-commit');
    const subagent = await writeSubagent(subagentsDir, 'lede-drafter');
    await writeSourceSupport(skillsDir, 'acme', 'reference.md');
    await writeFile(path.join(baseDir, 'AGENTS.local.md'), `# Local\n\n${AMBIENT_REGION}\n`, 'utf8');
    await writeFile(path.join(harnessHome, 'prompts.yml'), `prompts:\n${PROMPTS_REGION}\n`, 'utf8');

    const [retraction, ...rest] = await planDroppedHarnessRetractions({
      targets: CLAUDE_DECLARED,
      baseDir,
      ambient: 'project-local',
    });

    expect(rest).toEqual([]);
    expect(retraction?.harnessId).toBe('rovo');
    expect(retraction?.skillDirs).toEqual([rulebookSkill, declaredSkill]);
    expect(retraction?.subagentFiles).toEqual([subagent]);
    expect(retraction?.supportPaths).toEqual([path.join(skillsDir, '_sources')]);
    expect(retraction?.ambientHost).toEqual({
      kind: 'rewrite',
      path: path.join(baseDir, 'AGENTS.local.md'),
      content: '# Local\n',
    });
    expect(retraction?.promptsYml).toEqual({ kind: 'delete', path: path.join(harnessHome, 'prompts.yml') });
  });

  it('claims nothing that carries no ownership marker', async () => {
    const { skillsDir, subagentsDir } = await scaffoldHarnessTree('rovo', baseDir);
    await writeForeignSkill(skillsDir, 'hand-authored');
    await writeForeignSubagent(subagentsDir, 'hand-authored');

    expect(
      await planDroppedHarnessRetractions({ targets: CLAUDE_DECLARED, baseDir, ambient: 'project-local' }),
    ).toEqual([]);
  });

  it('omits a harness that holds no residue', async () => {
    await scaffoldHarnessTree('rovo', baseDir);

    expect(
      await planDroppedHarnessRetractions({ targets: CLAUDE_DECLARED, baseDir, ambient: 'project-local' }),
    ).toEqual([]);
  });

  it('deletes a project-local host the region was all of', async () => {
    const { skillsDir } = await scaffoldHarnessTree('rovo', baseDir);
    await writeDeclaredSkill(skillsDir, 'create-commit');
    await writeFile(path.join(baseDir, 'AGENTS.local.md'), `${AMBIENT_REGION}\n`, 'utf8');

    const [retraction] = await planDroppedHarnessRetractions({
      targets: CLAUDE_DECLARED,
      baseDir,
      ambient: 'project-local',
    });

    expect(retraction?.ambientHost).toEqual({ kind: 'delete', path: path.join(baseDir, 'AGENTS.local.md') });
  });

  it('empties the harness-home region and keeps its markers', async () => {
    const { harnessHome } = await scaffoldHarnessTree('rovo', baseDir);
    await writeFile(path.join(harnessHome, 'AGENTS.md'), `# Guidance\n\n${AMBIENT_REGION}\n`, 'utf8');

    const [retraction] = await planDroppedHarnessRetractions({
      targets: CLAUDE_DECLARED,
      baseDir,
      ambient: 'harness-home',
    });

    expect(retraction?.ambientHost).toEqual({
      kind: 'rewrite',
      path: path.join(harnessHome, 'AGENTS.md'),
      content: '# Guidance\n\n<!-- codeassembly-ambient:start -->\n<!-- codeassembly-ambient:end -->\n',
    });
  });

  it('leaves a prompts.yml carrying foreign entries, with the codeassembly region gone', async () => {
    const { harnessHome } = await scaffoldHarnessTree('rovo', baseDir);
    await writeFile(path.join(harnessHome, 'prompts.yml'), `prompts:\n  - name: foreign\n${PROMPTS_REGION}\n`, 'utf8');

    const [retraction] = await planDroppedHarnessRetractions({
      targets: CLAUDE_DECLARED,
      baseDir,
      ambient: 'project-local',
    });

    expect(retraction?.promptsYml).toEqual({
      kind: 'rewrite',
      path: path.join(harnessHome, 'prompts.yml'),
      content: 'prompts:\n  - name: foreign\n',
    });
  });

  it('leaves a prompts.yml carrying no codeassembly region alone', async () => {
    const { harnessHome, skillsDir } = await scaffoldHarnessTree('rovo', baseDir);
    await writeDeclaredSkill(skillsDir, 'create-commit');
    await writeFile(path.join(harnessHome, 'prompts.yml'), 'prompts:\n  - name: foreign\n', 'utf8');

    const [retraction] = await planDroppedHarnessRetractions({
      targets: CLAUDE_DECLARED,
      baseDir,
      ambient: 'project-local',
    });

    expect(retraction?.promptsYml).toBeUndefined();
  });

  it('retracts nothing when the flag rather than the declaration narrowed the run', async () => {
    const { skillsDir } = await scaffoldHarnessTree('rovo', baseDir);
    await writeDeclaredSkill(skillsDir, 'create-commit');

    expect(
      await planDroppedHarnessRetractions({
        targets: { harnessIds: ['claude'], origin: 'flag' },
        baseDir,
        ambient: 'project-local',
      }),
    ).toEqual([]);
  });

  it('retracts nothing when detection rather than the declaration settled the run', async () => {
    const { skillsDir } = await scaffoldHarnessTree('rovo', baseDir);
    await writeDeclaredSkill(skillsDir, 'create-commit');

    expect(
      await planDroppedHarnessRetractions({
        targets: { harnessIds: ['claude'], origin: 'detection' },
        baseDir,
        ambient: 'project-local',
      }),
    ).toEqual([]);
  });
});

describe(retractDroppedHarnesses, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = path.join(tmpdir(), `agents-test-retraction-run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('clears every surface the plan names and spares everything else', async () => {
    const { harnessHome, skillsDir, subagentsDir } = await scaffoldHarnessTree('rovo', baseDir);
    const rulebookSkill = await writeRulebookSkill(skillsDir, 'writing-prefs', 'writing-preferences');
    const declaredSkill = await writeDeclaredSkill(skillsDir, 'create-commit');
    const subagent = await writeSubagent(subagentsDir, 'lede-drafter');
    const foreignSkill = await writeForeignSkill(skillsDir, 'hand-authored');
    const foreignSubagent = await writeForeignSubagent(subagentsDir, 'hand-authored');
    await writeSourceSupport(skillsDir, 'acme', 'reference.md');
    const hostPath = path.join(baseDir, 'AGENTS.local.md');
    await writeFile(hostPath, `# Local\n\n${AMBIENT_REGION}\n\n## Tail\n`, 'utf8');
    await writeFile(path.join(harnessHome, 'prompts.yml'), `prompts:\n${PROMPTS_REGION}\n`, 'utf8');

    await retractDroppedHarnesses(
      await planDroppedHarnessRetractions({ targets: CLAUDE_DECLARED, baseDir, ambient: 'project-local' }),
    );

    expect(existsSync(rulebookSkill)).toBe(false);
    expect(existsSync(declaredSkill)).toBe(false);
    expect(existsSync(subagent)).toBe(false);
    expect(existsSync(path.join(skillsDir, '_sources'))).toBe(false);
    expect(existsSync(path.join(harnessHome, 'prompts.yml'))).toBe(false);
    expect(existsSync(foreignSkill)).toBe(true);
    expect(existsSync(foreignSubagent)).toBe(true);
    expect(await readFile(hostPath, 'utf8')).toBe('# Local\n\n## Tail\n');
  });

  it('leaves the targeted harness untouched', async () => {
    const { skillsDir } = await scaffoldHarnessTree('claude', baseDir);
    const targetedSkill = await writeDeclaredSkill(skillsDir, 'create-commit');
    const rovo = await scaffoldHarnessTree('rovo', baseDir);
    await writeDeclaredSkill(rovo.skillsDir, 'create-commit');

    await retractDroppedHarnesses(
      await planDroppedHarnessRetractions({ targets: CLAUDE_DECLARED, baseDir, ambient: 'project-local' }),
    );

    expect(existsSync(targetedSkill)).toBe(true);
    expect(existsSync(path.join(rovo.skillsDir, 'create-commit'))).toBe(false);
  });
});
