import { describe, expect, it } from 'vitest';

import { renderRulebookBody, type RulebookRenderContext } from '../rulebook-transform.ts';

const CLAUDE: RulebookRenderContext = { homeDir: '.claude', harnessId: 'claude' };
const ROVODEV: RulebookRenderContext = { homeDir: '.rovodev', harnessId: 'rovodev' };

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
      expect(renderRulebookBody(body, 'shell-conventions', CLAUDE)).toBe(expected);
    });

    it('anchors the rewrite at the rulebook, two levels below the content root', () => {
      // A sibling tree is reached with `../../`; one level shallower lands inside `guidance/`, which never deploys.
      expect(() => renderRulebookBody('[x](../skills/a.md)', 'a-rulebook', CLAUDE)).toThrow(
        /resolves to "guidance\/skills\/a\.md"/,
      );
    });

    it.each([
      'Visit [docs](https://example.com/docs).',
      'See [file](/absolute/path.md).',
      'See [file](~/.claude/skills/_data/concision.md).',
      'See [section](#a-heading).',
    ])('leaves a passthrough target untouched: %s', (body) => {
      expect(renderRulebookBody(body, 'a-rulebook', CLAUDE)).toBe(body);
    });

    it('expands a template variable that opens a link target', () => {
      expect(renderRulebookBody('Run [helper]({harness_home_dir}/scripts/helper.sh).', 'a-rulebook', CLAUDE)).toBe(
        'Run [helper](~/.claude/scripts/helper.sh).',
      );
    });
  });

  describe('template variables', () => {
    it('expands {harness_home_dir} and {harness_id}', () => {
      const body = 'Run {harness_home_dir}/scripts/emit.mjs --harness {harness_id}.';
      expect(renderRulebookBody(body, 'a-rulebook', CLAUDE)).toBe('Run ~/.claude/scripts/emit.mjs --harness claude.');
    });
  });

  describe('per-harness output', () => {
    it('yields each harness its own absolute path for one authored target', () => {
      const body = 'Full principle: [concision](../../skills/_data/concision.md).';
      expect(renderRulebookBody(body, 'a-rulebook', CLAUDE)).toContain('~/.claude/skills/_data/concision.md');
      expect(renderRulebookBody(body, 'a-rulebook', ROVODEV)).toContain('~/.rovodev/skills/_data/concision.md');
    });
  });

  describe('validation', () => {
    it.each([
      { name: 'a target under subagents/', target: '../../subagents/canary.md' },
      { name: 'a target under _partials/', target: '../../_partials/shared.md' },
      { name: 'a target under collections/', target: '../../collections/library.md' },
      { name: 'a sibling rulebook', target: './other-rulebook.md' },
      { name: 'a target in the content root itself', target: '../../README.md' },
    ])('rejects $name', ({ target }) => {
      expect(() => renderRulebookBody(`See [x](${target}).`, 'a-rulebook', CLAUDE)).toThrow(
        /not under a linkable root/,
      );
    });

    it('rejects a target escaping the content root', () => {
      expect(() => renderRulebookBody('See [x](../../../elsewhere/a.md).', 'a-rulebook', CLAUDE)).toThrow(
        /escapes the content root/,
      );
    });

    it('names the rulebook and the target as authored', () => {
      expect(() => renderRulebookBody('See [x](../../subagents/canary.md).', 'shell-conventions', CLAUDE)).toThrow(
        /shell-conventions[\s\S]*\.\.\/\.\.\/subagents\/canary\.md/,
      );
    });

    it('reports every offending target in one error', () => {
      const body = 'See [a](../../subagents/a.md) and [b](../../collections/b.md).';
      expect(() => renderRulebookBody(body, 'a-rulebook', CLAUDE)).toThrow(/2 unusable Markdown link target/);
    });

    it('validates before rewriting, so a bad target yields no partial output', () => {
      const body = 'Good [a](../../skills/a.md), bad [b](../../subagents/b.md).';
      expect(() => renderRulebookBody(body, 'a-rulebook', CLAUDE)).toThrow();
    });
  });

  it('returns a body with no links or variables unchanged', () => {
    const body = '# Heading\n\nPlain guidance text.\n';
    expect(renderRulebookBody(body, 'a-rulebook', CLAUDE)).toBe(body);
  });
});
