import { describe, expect, it } from 'vitest';

import type { RulebookInvocationCatalog } from '../invocation-tokens.ts';
import { renderRulebookBody, type RulebookRenderContext } from '../rulebook-transform.ts';

// `shell-conventions` carries a `skill-name` override; `nmr-cheatsheet` is ambient-only, so it deploys no skill.
const RULEBOOKS: RulebookInvocationCatalog = new Map([
  ['a-rulebook', { skillName: 'consult-a-rulebook', skill: true }],
  ['nmr-cheatsheet', { skillName: 'consult-nmr-cheatsheet', skill: false }],
  ['nmr-scripts', { skillName: 'consult-nmr-scripts', skill: true }],
  ['shell-conventions', { skillName: 'shell-rules', skill: true }],
]);

const CLAUDE_CONTEXT: RulebookRenderContext = {
  homeDir: '.claude',
  harnessId: 'claude',
  skillSigil: '/',
  subagentSigil: '',
  rulebooks: RULEBOOKS,
};
const ROVO_CONTEXT: RulebookRenderContext = {
  homeDir: '.rovodev',
  harnessId: 'rovodev',
  skillSigil: '!',
  subagentSigil: '',
  rulebooks: RULEBOOKS,
};

describe(renderRulebookBody, () => {
  describe('link rewriting', () => {
    it.each([
      {
        name: 'emits an absolute path for a target under skills/',
        body: 'Full principle: [concision](../../skills/_data/concision.md).',
        expected: 'Full principle: [concision](~/.claude/skills/_data/concision.md).',
      },
      {
        name: 'emits an absolute path for a target under scripts/',
        body: 'Run [describe-change](../../scripts/describe-change.sh).',
        expected: 'Run [describe-change](~/.claude/scripts/describe-change.sh).',
      },
      {
        name: 'preserves an anchor fragment',
        body: 'See [the block](../../skills/_data/action-items.md#the-block).',
        expected: 'See [the block](~/.claude/skills/_data/action-items.md#the-block).',
      },
      {
        name: 'rewrites every target in the body',
        body: 'Both [a](../../skills/_data/a.md) and [b](../../scripts/b.sh).',
        expected: 'Both [a](~/.claude/skills/_data/a.md) and [b](~/.claude/scripts/b.sh).',
      },
    ])('$name', ({ body, expected }) => {
      expect(renderRulebookBody(body, 'shell-conventions', CLAUDE_CONTEXT)).toBe(expected);
    });

    it('anchors the rewrite at the rulebook, two levels below the content root', () => {
      // A sibling tree is reached with `../../`; one level shallower lands inside `guidance/`, which never deploys.
      expect(() => renderRulebookBody('[x](../skills/a.md)', 'a-rulebook', CLAUDE_CONTEXT)).toThrow(
        /resolves to "guidance\/skills\/a\.md"/,
      );
    });

    it.each([
      'Visit [docs](https://example.com/docs).',
      'See [file](/absolute/path.md).',
      'See [file](~/.claude/skills/_data/concision.md).',
      'See [section](#a-heading).',
    ])('leaves a passthrough target untouched: %s', (body) => {
      expect(renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toBe(body);
    });

    it('expands a template variable that opens a link target', () => {
      expect(
        renderRulebookBody('Run [helper]({harness_home_dir}/scripts/helper.sh).', 'a-rulebook', CLAUDE_CONTEXT),
      ).toBe('Run [helper](~/.claude/scripts/helper.sh).');
    });
  });

  describe('invocation tokens', () => {
    it('renders a rulebook token as the deployed skill name of the target rulebook', () => {
      const body = 'See {rulebook:nmr-scripts} for the full reference.';
      expect(renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toBe(
        'See /consult-nmr-scripts for the full reference.',
      );
      expect(renderRulebookBody(body, 'a-rulebook', ROVO_CONTEXT)).toBe(
        'See !consult-nmr-scripts for the full reference.',
      );
    });

    it('renders a rulebook token through the skill-name override on the target', () => {
      expect(renderRulebookBody('See {rulebook:shell-conventions}.', 'a-rulebook', CLAUDE_CONTEXT)).toBe(
        'See /shell-rules.',
      );
    });

    it('renders skill and subagent tokens alongside rulebook tokens', () => {
      const body = 'Invoke {skill:capture-feedback}, dispatch {subagent:planner}, read {rulebook:nmr-scripts}.';
      expect(renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toBe(
        'Invoke /capture-feedback, dispatch planner, read /consult-nmr-scripts.',
      );
    });

    it('renders a token naming the rulebook itself', () => {
      expect(renderRulebookBody('Re-read {rulebook:a-rulebook}.', 'a-rulebook', CLAUDE_CONTEXT)).toBe(
        'Re-read /consult-a-rulebook.',
      );
    });

    it('rejects a token naming an ambient-only rulebook, pointing at dependencies:', () => {
      expect(() => renderRulebookBody('See {rulebook:nmr-cheatsheet}.', 'a-rulebook', CLAUDE_CONTEXT)).toThrow(
        /a-rulebook[\s\S]*\{rulebook:nmr-cheatsheet\}[\s\S]*ambient-only[\s\S]*`dependencies:`/,
      );
    });

    it('rejects a token naming no deployed rulebook', () => {
      expect(() => renderRulebookBody('See {rulebook:never-declared}.', 'a-rulebook', CLAUDE_CONTEXT)).toThrow(
        /\{rulebook:never-declared\}[\s\S]*no rulebook in the deployed set/,
      );
    });

    it('reports every offending token in one error', () => {
      const body = 'See {rulebook:never-declared} and {rulebook:nmr-cheatsheet}.';
      expect(() => renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toThrow(/2 unusable invocation token/);
    });
  });

  describe('template variables', () => {
    it('expands {harness_home_dir} and {harness_id}', () => {
      const body = 'Run {harness_home_dir}/scripts/emit.mjs --harness {harness_id}.';
      expect(renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toBe(
        'Run ~/.claude/scripts/emit.mjs --harness claude.',
      );
    });
  });

  describe('per-harness output', () => {
    it('yields each harness its own absolute path for one authored target', () => {
      const body = 'Full principle: [concision](../../skills/_data/concision.md).';
      expect(renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toContain('~/.claude/skills/_data/concision.md');
      expect(renderRulebookBody(body, 'a-rulebook', ROVO_CONTEXT)).toContain('~/.rovodev/skills/_data/concision.md');
    });
  });

  describe('validation', () => {
    it.each([
      { name: 'a target under subagents/', target: '../../subagents/canary.md' },
      { name: 'a target under _partials/', target: '../../_partials/shared.md' },
      { name: 'a target under collections/', target: '../../collections/library.md' },
      { name: 'a target in the content root itself', target: '../../README.md' },
    ])('rejects $name', ({ target }) => {
      expect(() => renderRulebookBody(`See [x](${target}).`, 'a-rulebook', CLAUDE_CONTEXT)).toThrow(
        /not under a linkable root/,
      );
    });

    it.each([
      { name: 'a sibling rulebook', target: './nmr-scripts.md' },
      { name: 'a sibling rulebook named without a leading dot', target: 'nmr-scripts.md' },
      { name: 'an ambient-only sibling, which is undeliverable either way', target: './nmr-cheatsheet.md' },
    ])('rejects $name, naming the token that replaces the link', ({ target }) => {
      expect(() => renderRulebookBody(`See [x](${target}).`, 'a-rulebook', CLAUDE_CONTEXT)).toThrow(
        /invoked rather than linked: write \{rulebook:nmr-[a-z]+\} instead/,
      );
    });

    it('rejects a target escaping the content root', () => {
      expect(() => renderRulebookBody('See [x](../../../elsewhere/a.md).', 'a-rulebook', CLAUDE_CONTEXT)).toThrow(
        /escapes the content root/,
      );
    });

    it('names the rulebook and the target as authored', () => {
      expect(() =>
        renderRulebookBody('See [x](../../subagents/canary.md).', 'shell-conventions', CLAUDE_CONTEXT),
      ).toThrow(/shell-conventions[\s\S]*\.\.\/\.\.\/subagents\/canary\.md/);
    });

    it('reports every offending target in one error', () => {
      const body = 'See [a](../../subagents/a.md) and [b](../../collections/b.md).';
      expect(() => renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toThrow(/2 unusable Markdown link target/);
    });

    it('validates before rewriting, so a bad target yields no partial output', () => {
      const body = 'Good [a](../../skills/a.md), bad [b](../../subagents/b.md).';
      expect(() => renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toThrow();
    });
  });

  it('returns a body with no links or variables unchanged', () => {
    const body = '# Heading\n\nPlain guidance text.\n';
    expect(renderRulebookBody(body, 'a-rulebook', CLAUDE_CONTEXT)).toBe(body);
  });
});
