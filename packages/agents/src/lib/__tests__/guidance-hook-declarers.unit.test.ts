import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findGuidanceHookDeclarers } from '../guidance-hook-declarers.ts';
import type { ResolvedSkill } from '../skill-deploy.ts';
import type { ResolvedSubagent } from '../subagent-deploy.ts';
import type { HarnessId } from '../types.ts';

const HARNESS_IDS: ReadonlyArray<HarnessId> = ['claude'];

describe(findGuidanceHookDeclarers, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `hook-declarers-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('lists a skill that declares a hook', async () => {
    const skill = await writeSkill(contentDir, 'implement-plan', 'Write the code.\n\n<!-- guidance-hook: impl -->\n');

    const declarers = await findGuidanceHookDeclarers([skill], [], HARNESS_IDS);

    expect(declarers.get('impl')).toEqual({ skills: ['implement-plan'], subagents: [] });
  });

  it('lists a subagent that declares a hook', async () => {
    const subagent = await writeSubagent(contentDir, 'coder', 'Write the code.\n\n<!-- guidance-hook: impl -->\n');

    const declarers = await findGuidanceHookDeclarers([], [subagent], HARNESS_IDS);

    expect(declarers.get('impl')).toEqual({ skills: [], subagents: ['coder'] });
  });

  it('lists both kinds under one hook when both declare it', async () => {
    const skill = await writeSkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
    const subagent = await writeSubagent(contentDir, 'coder', '<!-- guidance-hook: impl -->\n');

    const declarers = await findGuidanceHookDeclarers([skill], [subagent], HARNESS_IDS);

    expect(declarers.get('impl')).toEqual({ skills: ['implement-plan'], subagents: ['coder'] });
  });

  it('finds a hook a body declares through an included partial', async () => {
    await writePartial(contentDir, 'shared.md', 'Shared guidance.\n\n<!-- guidance-hook: impl -->\n');
    const skill = await writeSkill(contentDir, 'implement-plan', '<!-- include: ../../_partials/shared.md / -->\n');

    const declarers = await findGuidanceHookDeclarers([skill], [], HARNESS_IDS);

    expect(declarers.get('impl')).toEqual({ skills: ['implement-plan'], subagents: [] });
  });

  it('skips a skill that targets no harness the run deploys to', async () => {
    const skill = await writeSkill(contentDir, 'rovo-only', '<!-- guidance-hook: impl -->\n', ['rovo']);

    const declarers = await findGuidanceHookDeclarers([skill], [], HARNESS_IDS);

    expect(declarers.has('impl')).toBe(false);
  });

  it('omits a hook no deployed body declares', async () => {
    const skill = await writeSkill(contentDir, 'implement-plan', 'Write the code.\n');

    const declarers = await findGuidanceHookDeclarers([skill], [], HARNESS_IDS);

    expect(declarers.size).toBe(0);
  });
});

// region | Helpers

/** Writes a partial under the content root's `_partials/` directory. */
async function writePartial(contentDir: string, relativePath: string, body: string): Promise<void> {
  const fullPath = path.join(contentDir, '_partials', relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, body, 'utf8');
}

/** Writes a declared skill's `SKILL.md` under the content root and returns the skill as the resolver would. */
async function writeSkill(
  contentDir: string,
  slug: string,
  body: string,
  targetHarnesses?: ReadonlyArray<HarnessId>,
): Promise<ResolvedSkill> {
  const srcDir = path.join(contentDir, 'skills', slug);
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(srcDir, 'SKILL.md'), body, 'utf8');
  return { slug, srcDir, contentRoot: contentDir, source: undefined, targetHarnesses };
}

/** Writes a declared subagent's body under the content root and returns the subagent as the resolver would. */
async function writeSubagent(contentDir: string, slug: string, body: string): Promise<ResolvedSubagent> {
  const srcPath = path.join(contentDir, 'subagents', `${slug}.md`);
  await mkdir(path.dirname(srcPath), { recursive: true });
  await writeFile(srcPath, body, 'utf8');
  return { slug, srcPath, contentRoot: contentDir, source: undefined };
}

// endregion | Helpers
