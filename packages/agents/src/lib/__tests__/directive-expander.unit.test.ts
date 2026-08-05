import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DirectiveExpansionError, expandIncludes } from '../directive-expander.js';

describe(expandIncludes, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `directive-expander-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  async function writeSource(relPath: string, content: string): Promise<string> {
    const fullPath = path.join(contentDir, relPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
    return fullPath;
  }

  describe('resolution', () => {
    it('replaces a single self-closing directive with the included file content', async () => {
      const host = await writeSource(
        'harnesses/claude/CLAUDE.md',
        ['Read AGENTS.md.', '', '<!-- include: ../../shared/AGENTS.md / -->', ''].join('\n'),
      );
      await writeSource('shared/AGENTS.md', ['# Shared instructions', '', 'Be courteous.', ''].join('\n'));

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Read AGENTS.md.', '', '# Shared instructions', '', 'Be courteous.', ''].join('\n'));
    });

    it('resolves against the directive-bearing file directory, not the entry point directory', async () => {
      const host = await writeSource(
        'harnesses/rovo/AGENTS.md',
        ['<!-- include: ./codeassembly-guidance.md / -->', ''].join('\n'),
      );
      await writeSource('harnesses/rovo/codeassembly-guidance.md', 'Rovo-specific.\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe('Rovo-specific.\n');
    });

    it('replaces multiple directives in order', async () => {
      const host = await writeSource(
        'host.md',
        ['<!-- include: a.md / -->', '<!-- include: b.md / -->', ''].join('\n'),
      );
      await writeSource('a.md', 'AAA\n');
      await writeSource('b.md', 'BBB\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['AAA', 'BBB', ''].join('\n'));
    });

    it('expands nested directives recursively', async () => {
      const host = await writeSource('host.md', '<!-- include: nested/level1.md / -->\n');
      await writeSource(
        'nested/level1.md',
        ['Level 1 prefix', '<!-- include: ./level2.md / -->', 'Level 1 suffix', ''].join('\n'),
      );
      await writeSource('nested/level2.md', 'Level 2 content\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Level 1 prefix', 'Level 2 content', 'Level 1 suffix', ''].join('\n'));
    });

    it('tolerates leading and trailing whitespace around the directive', async () => {
      const host = await writeSource(
        'host.md',
        ['  <!-- include: target.md / -->  ', '\t<!--\tinclude:\ttarget.md\t/\t-->\t', ''].join('\n'),
      );
      await writeSource('target.md', 'X\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['X', 'X', ''].join('\n'));
    });

    it('does not expand inline-prose mentions of the directive', async () => {
      const host = await writeSource(
        'host.md',
        [
          'Use the `<!-- include: target.md / -->` syntax to include files.',
          'Prefix text <!-- include: target.md / --> suffix text',
          '',
        ].join('\n'),
      );
      await writeSource('target.md', 'INCLUDED\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(
        [
          'Use the `<!-- include: target.md / -->` syntax to include files.',
          'Prefix text <!-- include: target.md / --> suffix text',
          '',
        ].join('\n'),
      );
    });

    it('treats inline-prose mention of <!-- /include --> as plain content, not as a close directive', async () => {
      // The CLOSE_REGEX is line-anchored. A line with non-whitespace text preceding
      // `<!-- /include -->` must not trigger orphan-close handling — authors writing
      // documentation about the directive grammar inside partials must be able to
      // include close-tag examples in prose.
      const host = await writeSource(
        'host.md',
        ['Authors close open directives with `<!-- /include -->` on its own line.', ''].join('\n'),
      );

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Authors close open directives with `<!-- /include -->` on its own line.', ''].join('\n'));
    });

    it('returns content unchanged when no directives are present', async () => {
      const host = await writeSource('host.md', '# Title\n\nBody.\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe('# Title\n\nBody.\n');
    });

    it('allows the same target to be included from independent branches', async () => {
      const host = await writeSource(
        'host.md',
        ['<!-- include: target.md / -->', '<!-- include: target.md / -->', ''].join('\n'),
      );
      await writeSource('target.md', 'shared\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['shared', 'shared', ''].join('\n'));
    });
  });

  describe('directive shapes', () => {
    it('expands an open/close pair with empty slot when partial has no children placeholder', async () => {
      const host = await writeSource('host.md', ['<!-- include: partial.md -->', '<!-- /include -->', ''].join('\n'));
      await writeSource('partial.md', 'no slot here\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['no slot here', ''].join('\n'));
    });

    it('substitutes <!-- children --> with caller slot content', async () => {
      const host = await writeSource(
        'host.md',
        ['<!-- include: partial.md -->', 'slot line 1', 'slot line 2', '<!-- /include -->', ''].join('\n'),
      );
      await writeSource('partial.md', ['Before', '<!-- children -->', 'After', ''].join('\n'));

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Before', 'slot line 1', 'slot line 2', 'After', ''].join('\n'));
    });

    it('substitutes <!-- children --> with empty when self-closing form is used', async () => {
      const host = await writeSource('host.md', ['<!-- include: partial.md / -->', ''].join('\n'));
      await writeSource('partial.md', ['Before', '<!-- children -->', 'After', ''].join('\n'));

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Before', 'After', ''].join('\n'));
    });

    it('substitutes <!-- children --> with empty when open/close pair has no slot content', async () => {
      const host = await writeSource('host.md', ['<!-- include: partial.md -->', '<!-- /include -->', ''].join('\n'));
      await writeSource('partial.md', ['Before', '<!-- children -->', 'After', ''].join('\n'));

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Before', 'After', ''].join('\n'));
    });

    it('expands nested includes inside slot content', async () => {
      const host = await writeSource(
        'host.md',
        ['<!-- include: partial.md -->', '<!-- include: inner.md / -->', '<!-- /include -->', ''].join('\n'),
      );
      await writeSource('partial.md', ['Before', '<!-- children -->', 'After', ''].join('\n'));
      await writeSource('inner.md', 'INNER\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Before', 'INNER', 'After', ''].join('\n'));
    });

    it('expands a partial that itself includes another partial', async () => {
      const host = await writeSource('host.md', ['<!-- include: outer.md / -->', ''].join('\n'));
      await writeSource('outer.md', ['Outer top', '<!-- include: inner.md / -->', 'Outer bottom', ''].join('\n'));
      await writeSource('inner.md', 'Inner body\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Outer top', 'Inner body', 'Outer bottom', ''].join('\n'));
    });

    it('preserves leading blank line in slot content verbatim', async () => {
      const host = await writeSource(
        'host.md',
        ['<!-- include: partial.md -->', '', 'slot body', '<!-- /include -->', ''].join('\n'),
      );
      await writeSource('partial.md', ['Before', '<!-- children -->', 'After', ''].join('\n'));

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Before', '', 'slot body', 'After', ''].join('\n'));
    });

    it('routes slot content correctly when an open directive is nested inside another open directive', async () => {
      // Outer open/close pair contains an inner open/close pair as slot content. The
      // inner frame's expanded output must be treated as slot content for the outer
      // frame, then substituted into the outer partial's <!-- children --> placeholder.
      const host = await writeSource(
        'host.md',
        [
          '<!-- include: outer.md -->',
          'outer-slot-prefix',
          '<!-- include: inner.md -->',
          'inner-slot-line',
          '<!-- /include -->',
          'outer-slot-suffix',
          '<!-- /include -->',
          '',
        ].join('\n'),
      );
      await writeSource('outer.md', ['OUTER-BEFORE', '<!-- children -->', 'OUTER-AFTER', ''].join('\n'));
      await writeSource('inner.md', ['INNER-BEFORE', '<!-- children -->', 'INNER-AFTER', ''].join('\n'));

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(
        [
          'OUTER-BEFORE',
          'outer-slot-prefix',
          'INNER-BEFORE',
          'inner-slot-line',
          'INNER-AFTER',
          'outer-slot-suffix',
          'OUTER-AFTER',
          '',
        ].join('\n'),
      );
    });

    it('returns to top-level output between two sequential non-nested open/close blocks', async () => {
      // Two open/close pairs at top level. Between them, the stack must be empty so
      // intervening prose flows to the output buffer rather than being captured by a
      // stale frame.
      const host = await writeSource(
        'host.md',
        [
          '<!-- include: partial.md -->',
          'first-slot',
          '<!-- /include -->',
          'between',
          '<!-- include: partial.md -->',
          'second-slot',
          '<!-- /include -->',
          '',
        ].join('\n'),
      );
      await writeSource('partial.md', ['Begin', '<!-- children -->', 'End', ''].join('\n'));

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Begin', 'first-slot', 'End', 'between', 'Begin', 'second-slot', 'End', ''].join('\n'));
    });
  });

  describe('error cases', () => {
    it('throws not-found when the resolved path does not exist', async () => {
      const host = await writeSource('host.md', '<!-- include: missing.md / -->\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        name: 'DirectiveExpansionError',
        reason: 'not-found',
        message: expect.stringContaining('host.md:1'),
      });
    });

    it('reports the correct line number when the directive is not on line 1', async () => {
      const host = await writeSource(
        'host.md',
        ['# Title', '', 'Some prose.', '<!-- include: missing.md / -->', ''].join('\n'),
      );

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'not-found',
        message: expect.stringContaining(':4'),
      });
    });

    it('throws out-of-tree when the resolved path escapes contentDir', async () => {
      const host = await writeSource('harnesses/claude/CLAUDE.md', '<!-- include: ../../../escape.md / -->\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'out-of-tree',
        message: expect.stringContaining('out-of-tree'),
      });
    });

    it('throws cycle when an included file transitively includes its host', async () => {
      const host = await writeSource('a.md', '<!-- include: b.md / -->\n');
      await writeSource('b.md', '<!-- include: a.md / -->\n');

      const promise = expandIncludes(host, contentDir);
      await expect(promise).rejects.toBeInstanceOf(DirectiveExpansionError);
      await expect(promise).rejects.toMatchObject({
        reason: 'cycle',
        message: expect.stringContaining('cycle detected'),
      });
    });

    it('throws cycle for a self-reference', async () => {
      const host = await writeSource('self.md', '<!-- include: ./self.md / -->\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'cycle',
      });
    });

    it('throws cycle when slot content of an open/close pair includes the host file', async () => {
      // Cycle introduced through the open/close slot path: host opens partial.md and
      // partial.md self-close-includes host.md. The visited set must be threaded
      // through `expandPartialWithSlot -> expandFile` to detect this.
      const host = await writeSource(
        'host.md',
        ['<!-- include: partial.md -->', 'slot body', '<!-- /include -->', ''].join('\n'),
      );
      await writeSource('partial.md', ['Before', '<!-- include: ./host.md / -->', 'After', ''].join('\n'));

      const promise = expandIncludes(host, contentDir);
      await expect(promise).rejects.toBeInstanceOf(DirectiveExpansionError);
      await expect(promise).rejects.toMatchObject({
        reason: 'cycle',
        message: expect.stringContaining('cycle detected'),
      });
    });

    it('throws orphan-close when a close directive has no matching open', async () => {
      const host = await writeSource('host.md', ['<!-- /include -->', ''].join('\n'));

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'orphan-close',
        message: expect.stringContaining('host.md:1'),
      });
    });

    it('throws unclosed-open when a file ends with an open directive that is never closed', async () => {
      const host = await writeSource('host.md', ['<!-- include: partial.md -->', 'slot', ''].join('\n'));
      await writeSource('partial.md', 'partial body\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'unclosed-open',
        message: expect.stringContaining('host.md:1'),
      });
    });

    it('throws slot-without-children when the caller provides slot content but the partial has no placeholder', async () => {
      const host = await writeSource(
        'host.md',
        ['<!-- include: partial.md -->', 'slot content', '<!-- /include -->', ''].join('\n'),
      );
      await writeSource('partial.md', ['No placeholder here', ''].join('\n'));

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'slot-without-children',
        message: expect.stringContaining('partial.md'),
      });
    });

    it('throws unrecognized-parameter for include syntax with unknown trailing tokens', async () => {
      const host = await writeSource('host.md', ['<!-- include: target.md unknown -->', ''].join('\n'));
      await writeSource('target.md', 'X\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'unrecognized-parameter',
        message: expect.stringContaining('host.md:1'),
      });
    });

    it('throws unrecognized-parameter when no whitespace follows the colon', async () => {
      const host = await writeSource('host.md', ['<!-- include:target.md unknown -->', ''].join('\n'));
      await writeSource('target.md', 'X\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'unrecognized-parameter',
        message: expect.stringContaining('host.md:1'),
      });
    });
  });
});
