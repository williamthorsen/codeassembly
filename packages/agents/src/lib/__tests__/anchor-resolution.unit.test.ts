import { describe, expect, it } from 'vitest';

import {
  assertAnchorsResolve,
  collectHeadingPositions,
  collectHeadingSlugs,
  normalizeForAnchorScan,
} from '../anchor-resolution.ts';

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

    it('resolves a target carrying a Markdown link title on its fragment alone', () => {
      const body = '## Lifecycle events\n\nSee [the events](#lifecycle-events "the events").\n';
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

    it('offers the partial as a conditional lead rather than asserting one was inlined', () => {
      // Two wiring sites expand no includes at all, so a body reaching this error may have no partial behind it.
      expect(() => assertAnchorsResolve('[a](#nope)\n', LABEL)).toThrow(/If a target was authored in an inlined/);
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

    it('scans a body opening on a thematic break, whose delimiters carry no YAML key', () => {
      const body = '---\n\n## Lifecycle events\n\n---\n\n[x](#lifecycle-events)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });

    it('does not scan a link inside a tilde fence', () => {
      const body = 'Write it as:\n\n~~~markdown\n[the events](#lifecycle-events)\n~~~\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });

    it('does not offer a heading inside a tilde fence as a target', () => {
      const body = '~~~markdown\n## Sample heading\n~~~\n\n[x](#sample-heading)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/names no heading/);
    });

    it('keeps a shorter fence run inside a longer one as content', () => {
      const body = '````markdown\n```\n[x](#nowhere)\n```\n````\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });

    it('fails on a fence nothing closes rather than passing over the unchecked remainder', () => {
      const body = '# T\n\n```ts\nconst x = 1;\n\n## Real heading\n\n[x](#nowhere)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/opens a code fence with ``` that nothing closes/);
    });

    it('fails when a longer opening run meets a shorter closing one', () => {
      // The four-tick form is how a fenced example carries a fence of its own, so the mismatch belongs to that case.
      const body = '# T\n\n````markdown\nsample\n```\n\n## Real heading\n\n[x](#real-heading)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).toThrow(/opens a code fence with ```` that nothing closes/);
    });

    it('does not scan a link inside an inline code span', () => {
      const body = 'Point at it with `[option format](#option-format)` in prose.\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });

    it('keeps an inline code span in a heading, whose backticks the slug drops as punctuation', () => {
      // Blanking the span here would rewrite the slug; anchors into `_data/pr-source-resolution.md` depend on it.
      const body = '### The `respond-to-review` path\n\n[x](#the-respond-to-review-path)\n';
      expect(() => assertAnchorsResolve(body, LABEL)).not.toThrow();
    });

    it('scans a link inside an indented code block, which is not an exempt region', () => {
      // Telling an indented block from a nested list item needs block-level parsing, and a wrong call there would
      // blank a list item's real anchor. The specification records the exemption boundary.
      const body = 'Example:\n\n    [x](#nowhere)\n';
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

describe(collectHeadingPositions, () => {
  it('reports each heading in document order with its level and start index', () => {
    const body = '# Top\n\n## Middle\n\n### Leaf\n';
    expect(collectHeadingPositions(body)).toEqual([
      { slug: 'top', level: 1, index: 0 },
      { slug: 'middle', level: 2, index: 7 },
      { slug: 'leaf', level: 3, index: 18 },
    ]);
  });

  it('gives an index a caller can compare against a passage, so a section can be told from its successor', () => {
    const body = '## First\n\ntoken here\n\n## Second\n';
    const [first, second] = collectHeadingPositions(body);

    expect(first?.index).toBeLessThan(body.indexOf('token here'));
    expect(second?.index).toBeGreaterThan(body.indexOf('token here'));
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
    const lines = normalizeForAnchorScan(content).split('\n');
    expect(lines).toHaveLength(content.split('\n').length);
    expect(lines[4]).toBe('# Title');
    expect(lines[10]).toBe('Tail');
  });
});
