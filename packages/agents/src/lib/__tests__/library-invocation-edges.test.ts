import { describe, expect, it } from 'vitest';

import { resolveContentDir } from '../content-resolver.ts';
import { resolveClosure } from '../dependency-resolver.ts';

// Asserts that the content library's invocation edges resolve: declaring a skill pulls the skills and subagents it
// invokes into its closure, whether the invocation is an inline body token or a non-inline dispatch declared in
// frontmatter.
describe('library invocation edges', () => {
  const contentDir = resolveContentDir();

  it('pulls capture-event into capture-feedback via its body token', async () => {
    const closure = await resolveClosure({ skill: ['capture-feedback'] }, contentDir);

    expect(closure.skills).toContain('capture-event');
  });

  it('pulls capture-feedback into collaborate, and capture-event transitively', async () => {
    const closure = await resolveClosure({ skill: ['collaborate'] }, contentDir);

    expect(closure.skills).toContain('capture-feedback');
    expect(closure.skills).toContain('capture-event');
  });

  it('pulls create-pr delegates and the changelog-writer they reach', async () => {
    const closure = await resolveClosure({ skill: ['create-pr'] }, contentDir);

    expect(closure.skills).toEqual(expect.arrayContaining(['create-gh-pr', 'create-bitbucket-pr', 'summarize-change']));
    expect(closure.subagents).toContain('changelog-writer');
  });

  it('pulls orchestrate dispatched subagents declared in frontmatter', async () => {
    const closure = await resolveClosure({ skill: ['orchestrate'] }, contentDir);

    expect(closure.subagents).toEqual(
      expect.arrayContaining([
        'aspect-code-reviewer',
        'orchestrated-coder',
        'orchestrated-reviewer',
        'savings-analyzer',
      ]),
    );
  });

  it('pulls refine-plan review subagents declared in frontmatter', async () => {
    const closure = await resolveClosure({ skill: ['refine-plan'] }, contentDir);

    expect(closure.subagents).toEqual(expect.arrayContaining(['plan-reviewer', 'plan-reviser']));
  });
});
