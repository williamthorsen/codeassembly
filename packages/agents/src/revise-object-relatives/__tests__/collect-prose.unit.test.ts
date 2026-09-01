import { describe, expect, it } from 'vitest';

import { extractProse } from '../collect-prose.ts';

describe(extractProse, () => {
  describe('markdown', () => {
    const MARKDOWN = [
      '---',
      'name: fixture',
      '---',
      '',
      '# Heading prose',
      '',
      'Body prose in a paragraph.',
      '',
      '```ts',
      'const fencedCodeProse = 1;',
      '```',
      '',
      '<!-- A commented aside. -->',
      '',
      '- A list item with a [link label](https://example.invalid/target).',
      '',
      '| Head | Tail |',
      '| ---- | ---- |',
      '| the source | it names |',
      '',
      '[ref]: https://example.invalid/definition',
    ].join('\n');

    it('yields body prose with its own line numbers', () => {
      const spans = extract(MARKDOWN, 'markdown');

      expect(spans).toContainEqual({ file: 'fixture.md', line: 5, text: 'Heading prose' });
      expect(spans).toContainEqual({ file: 'fixture.md', line: 7, text: 'Body prose in a paragraph.' });
    });

    it('drops frontmatter, fenced code, HTML comments, and link definitions', () => {
      const text = joinText(extract(MARKDOWN, 'markdown'));

      expect(text).not.toContain('fencedCodeProse');
      expect(text).not.toContain('name: fixture');
      expect(text).not.toContain('commented aside');
      expect(text).not.toContain('example.invalid');
    });

    it('keeps a link label and drops its URL', () => {
      const spans = extract(MARKDOWN, 'markdown');

      expect(spans).toContainEqual({ file: 'fixture.md', line: 15, text: 'A list item with a link label.' });
    });

    it('yields each table cell separately, so one cell never runs into the next', () => {
      const text = joinText(extract(MARKDOWN, 'markdown'));

      expect(text).not.toContain('the source  it names');
      expect(text).toContain('the source');
      expect(text).toContain('it names');
    });

    it('joins a wrapped paragraph into one span whose newlines locate each line', () => {
      const spans = extract('First half of a\nsentence that wraps.\n', 'markdown');

      expect(spans).toStrictEqual([{ file: 'fixture.md', line: 1, text: 'First half of a\nsentence that wraps.' }]);
    });

    it('joins a wrapped blockquote into one span, so a construction spanning its lines survives', () => {
      const spans = extract('> First half of a\n> sentence that wraps.\n', 'markdown');

      expect(spans).toStrictEqual([{ file: 'fixture.md', line: 1, text: 'First half of a\nsentence that wraps.' }]);
    });
  });

  describe('script', () => {
    const SCRIPT = [
      '/**',
      ' * A doc comment describing the helper.',
      ' */',
      'export function buildHelpText(sourceName: string): string {',
      '  // A line comment about the branch below.',
      '  // Its continuation line.',
      "  const identifierOnlyLiteral = 'kebab-case-value';",
      "  const help = 'Print the ID of the ticket a branch name encodes.';",
      '  return `${help} Source: ${sourceName}`;',
      '}',
    ].join('\n');

    it('yields doc comments and line comments', () => {
      const spans = extract(SCRIPT, 'script');

      expect(spans).toContainEqual({ file: 'fixture.md', line: 2, text: 'A doc comment describing the helper.' });
      expect(spans).toContainEqual({
        file: 'fixture.md',
        line: 5,
        text: 'A line comment about the branch below.\nIts continuation line.',
      });
    });

    it('yields a multi-word literal, which is what reaches a reader as help text', () => {
      const text = joinText(extract(SCRIPT, 'script'));

      expect(text).toContain('Print the ID of the ticket a branch name encodes.');
    });

    it('yields no identifier and no single-token literal', () => {
      const text = joinText(extract(SCRIPT, 'script'));

      expect(text).not.toContain('buildHelpText');
      expect(text).not.toContain('kebab-case-value');
    });

    it('reads a division as arithmetic rather than as a regular expression', () => {
      const spans = extract('const ratio = total / count; // The share each caller holds.\n', 'script');

      expect(spans).toStrictEqual([{ file: 'fixture.md', line: 1, text: 'The share each caller holds.' }]);
    });
  });

  describe('shell', () => {
    const SHELL = [
      '#!/usr/bin/env bash',
      '# Reports the branch a worktree checks out.',
      '# Second line of the same block.',
      String.raw`printf "%s\n" "# not a comment"`,
      'branch=$(git branch --show-current) # A trailing note.',
    ].join('\n');

    it('yields comment blocks and skips the shebang', () => {
      const spans = extract(SHELL, 'shell');

      expect(spans).toStrictEqual([
        {
          file: 'fixture.md',
          line: 2,
          text: 'Reports the branch a worktree checks out.\nSecond line of the same block.',
        },
        { file: 'fixture.md', line: 5, text: 'A trailing note.' },
      ]);
    });
  });
});

// region | Helpers

/** Extracts prose from a fixture body under one kind, holding the file name constant so assertions read cleanly. */
function extract(content: string, kind: 'markdown' | 'script' | 'shell') {
  return extractProse({ file: 'fixture.md', content, kind });
}

/** Joins every span's text, for the assertions that ask what the whole extraction did and did not carry. */
function joinText(spans: ReturnType<typeof extractProse>): string {
  return spans.map((span) => span.text).join('\n');
}

// endregion | Helpers
