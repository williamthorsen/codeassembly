import { describe, expect, it } from 'vitest';

import { assertAnchorsResolve, collectHeadingSlugs, normalizeForAnchorScan } from '../anchor-resolution.ts';

const LABEL = 'skills/a-skill/SKILL.md';

describe(assertAnchorsResolve, () => {
  describe('resolution', () => {
    it('accepts an anchor naming exactly one heading in the same body', () => {
      const body = '## Lifecycle events\n\nSee [the events](#lifecycle-events).\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });

    it('rejects an anchor naming no heading', () => {
      const body = '## Option format\n\nSee [the events](#lifecycle-events).\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/#lifecycle-events -- names no heading/);
    });

    it('rejects an anchor naming more than one heading', () => {
      const body = '## Output format\n\n## Output format\n\nSee [the format](#output-format).\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/#output-format -- names 2 headings/);
    });

    it('matches a heading at any level', () => {
      const body = '###### Deeply nested\n\n[x](#deeply-nested)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });
  });

  describe('reporting', () => {
    it('names the artifact and counts the offending targets', () => {
      const body = '[a](#nope)\n\n[b](#also-nope)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(`${LABEL} carries 2 unresolvable anchor link target(s)`);
    });

    it('reports a target repeated across the body once', () => {
      const body = '[a](#nope)\n\n[b](#nope)\n\n[c](#nope)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/carries 1 unresolvable/);
    });

    it('points the author at the partial an inlined anchor came from', () => {
      expect(() => assertAnchorsResolve('[a](#nope)\n', LABEL)).toThrow(/fix the partial/);
    });
  });

  describe('regions that illustrate rather than declare', () => {
    it('does not offer a heading inside a fence as a target', () => {
      const body = '```markdown\n## Specification consistency\n```\n\n[x](#specification-consistency)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/names no heading/);
    });

    it('does not scan a link inside a fence', () => {
      const body = 'Write it as:\n\n```markdown\n[the events](#lifecycle-events)\n```\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });

    it('does not scan a link in frontmatter', () => {
      const body = '---\nname: a-skill\ndescription: See [elsewhere](#nowhere)\n---\n\n# A skill\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });

    it('does not count a comment line in frontmatter as a heading', () => {
      const body = '---\n# Deprecated key\nname: a-skill\n---\n\n[x](#deprecated-key)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/names no heading/);
    });

    it('scans a body opening on a thematic break', () => {
      const body = '---\n\n## Lifecycle events\n\n---\n\n[x](#nowhere)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/#nowhere -- names no heading/);
    });

    it('scans a body whose leading delimiter is never closed', () => {
      const body = '---\nname: a-skill\n\n## Lifecycle events\n\n[x](#lifecycle-events)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });
  });

  describe('targets it leaves alone', () => {
    it.each([
      { name: 'a relative path carrying a fragment', target: '../other.md#nowhere' },
      { name: 'an absolute path carrying a fragment', target: '/etc/other.md#nowhere' },
      { name: 'a tilde path carrying a fragment', target: '~/.claude/skills/other.md#nowhere' },
      { name: 'a URL carrying a fragment', target: 'https://example.com/doc#nowhere' },
      { name: 'a template-variable target carrying a fragment', target: '{harness_home_dir}/other.md#nowhere' },
    ])('ignores $name', ({ target }) => {
      expect(() => assertAnchorsResolve(`[x](${target})\n`, LABEL)).not.toThrow();
    });
  });
});

describe(collectHeadingSlugs, () => {
  it('counts each slug, so an ambiguous fragment is distinguishable from a resolving one', () => {
    const slugs = collectHeadingSlugs('# Once\n\n## Twice\n\n### Twice\n');
    expect(slugs.get('once')).toBe(1);
    expect(slugs.get('twice')).toBe(2);
  });

  it('derives an anchor the way GitHub does, preserving the gap punctuation leaves behind', () => {
    // Stripping `(`, `/`, `)`, and `+` leaves two adjacent spaces, which is what yields the double hyphen.
    const slugs = collectHeadingSlugs('### Finding scheme (F/W/T/R/S) + legacy suffix\n');
    expect(slugs.has('finding-scheme-fwtrs--legacy-suffix')).toBe(true);
  });

  it('ignores a line whose hashes are not followed by whitespace', () => {
    expect(collectHeadingSlugs('#hashtag\n').size).toBe(0);
  });
});

describe(normalizeForAnchorScan, () => {
  it('blanks lines rather than removing them, so surviving lines keep their positions', () => {
    const content = '---\nname: a-skill\n---\n\n# Title\n\n```ts\nconst x = 1;\n```\n\nTail\n';
    const normalized = normalizeForAnchorScan(content);
    expect(normalized.split('\n')).toHaveLength(content.split('\n').length);
    expect(normalized.split('\n')[4]).toBe('# Title');
    expect(normalized.split('\n')[10]).toBe('Tail');
  });
});
