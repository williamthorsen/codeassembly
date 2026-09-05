import { describe, expect, it } from 'vitest';

import { extractProse } from '../collect-prose.ts';
import { UnparsableYamlError } from '../extract-yaml.ts';
import { CODE_SPAN_PLACEHOLDER } from '../mask-code-spans.ts';
import type { ProseKind } from '../types.ts';

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

    it('drops fenced code, HTML comments, and link definitions', () => {
      const text = joinText(extract(MARKDOWN, 'markdown'));

      expect(text).not.toContain('fencedCodeProse');
      expect(text).not.toContain('commented aside');
      expect(text).not.toContain('example.invalid');
    });

    it('yields frontmatter prose at its own source line', () => {
      const spans = extract('---\ndescription: Reports the branch a worktree checks out.\n---\n\nBody.\n', 'markdown');

      expect(spans).toContainEqual({ file: 'fixture.md', line: 2, text: 'Reports the branch a worktree checks out.' });
    });

    it('yields no frontmatter key and no single-token frontmatter value', () => {
      const text = joinText(extract(MARKDOWN, 'markdown'));

      expect(text).not.toContain('name: fixture');
    });

    it('yields body prose where the frontmatter cannot be parsed', () => {
      const spans = extract('---\naliases:\n  git: [vcs, version-control\n---\n\nBody prose survives.\n', 'markdown');

      expect(joinText(spans)).toContain('Body prose survives.');
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

  describe('yaml', () => {
    const YAML_DOC = [
      '# A comment about the file the sweep reads.',
      '# Its continuation line.',
      'name: fixture-value',
      'description: Reports the branch a worktree checks out.',
      'prompt: |',
      '  A block scalar line the reader reads.',
      '  A second line with a # that is content.',
      'folded: >-',
      '  A folded line that wraps',
      '  onto the next source line.',
      'quoted: "a # inside a quoted scalar value"',
      'tail: 1 # A trailing note.',
    ].join('\n');

    it('yields comments, block scalars, and multi-word values, each at its own source line', () => {
      expect(extract(YAML_DOC, 'yaml')).toStrictEqual([
        { file: 'fixture.md', line: 1, text: 'A comment about the file the sweep reads.\nIts continuation line.' },
        { file: 'fixture.md', line: 4, text: 'Reports the branch a worktree checks out.' },
        {
          file: 'fixture.md',
          line: 6,
          text: 'A block scalar line the reader reads.\nA second line with a # that is content.',
        },
        { file: 'fixture.md', line: 9, text: 'A folded line that wraps\nonto the next source line.' },
        { file: 'fixture.md', line: 11, text: 'a # inside a quoted scalar value' },
        { file: 'fixture.md', line: 12, text: 'A trailing note.' },
      ]);
    });

    it('yields no mapping key and no single-token value', () => {
      const text = joinText(extract(YAML_DOC, 'yaml'));

      expect(text).not.toContain('description');
      expect(text).not.toContain('fixture-value');
    });

    it('wraps a plain scalar and a quoted scalar across source lines, each at the line on which it opens', () => {
      const wrapped = [
        'plain: A plain scalar that wraps',
        '  onto a second source line.',
        'quoted: "A quoted scalar that wraps',
        '  onto a second source line."',
      ].join('\n');

      expect(extract(wrapped, 'yaml')).toStrictEqual([
        { file: 'fixture.md', line: 1, text: 'A plain scalar that wraps\nonto a second source line.' },
        { file: 'fixture.md', line: 3, text: 'A quoted scalar that wraps\nonto a second source line.' },
      ]);
    });

    it('flattens an escaped newline, which its one source line does not carry', () => {
      const spans = extract(String.raw`text: "First sentence here.\nA second one the reader reads."`, 'yaml');

      expect(spans).toStrictEqual([
        { file: 'fixture.md', line: 1, text: 'First sentence here. A second one the reader reads.' },
      ]);
    });

    it('reads a document whose duplicate key leaves every scalar bound', () => {
      const duplicated = 'name: one\ntext: Reports the branch a worktree checks out.\nname: two\n';

      expect(joinText(extract(duplicated, 'yaml'))).toContain('Reports the branch a worktree checks out.');
    });

    it('refuses a document that the parser cannot read, so no sweep counts it clean', () => {
      expect(() => extract('aliases:\n  git: [vcs, version-control\n', 'yaml')).toThrow(UnparsableYamlError);
    });
  });

  describe('inline code', () => {
    it('masks a span in Markdown body prose', () => {
      const spans = extract('The root `tsconfig.json` names it.\n', 'markdown');

      expect(joinText(spans)).not.toContain('tsconfig');
      expect(joinText(spans)).toContain(CODE_SPAN_PLACEHOLDER);
    });

    it('masks a span in a Markdown table cell', () => {
      const spans = extract('| Head |\n| ---- |\n| the `sync` command |\n', 'markdown');

      expect(joinText(spans)).not.toContain('sync');
      expect(joinText(spans)).toContain(CODE_SPAN_PLACEHOLDER);
    });

    it('masks a span in a script comment', () => {
      const spans = extract('// The root `tsconfig.json` names it.\n', 'script');

      expect(joinText(spans)).not.toContain('tsconfig');
      expect(joinText(spans)).toContain(CODE_SPAN_PLACEHOLDER);
    });

    it('masks a span in a shell comment', () => {
      const spans = extract('#!/usr/bin/env bash\n# The root `tsconfig.json` names it.\n', 'shell');

      expect(joinText(spans)).not.toContain('tsconfig');
      expect(joinText(spans)).toContain(CODE_SPAN_PLACEHOLDER);
    });

    it('masks a span in a YAML comment', () => {
      const spans = extract('# The root `tsconfig.json` names it.\n', 'yaml');

      expect(joinText(spans)).not.toContain('tsconfig');
      expect(joinText(spans)).toContain(CODE_SPAN_PLACEHOLDER);
    });
  });
});

// region | Helpers

/** Extracts prose from a fixture body under one kind, holding the file name constant so assertions read cleanly. */
function extract(content: string, kind: ProseKind) {
  return extractProse({ file: 'fixture.md', content, kind });
}

/** Joins every span's text, for the assertions that ask what the whole extraction did and did not carry. */
function joinText(spans: ReturnType<typeof extractProse>): string {
  return spans.map((span) => span.text).join('\n');
}

// endregion | Helpers
