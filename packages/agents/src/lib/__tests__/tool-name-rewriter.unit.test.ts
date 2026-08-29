import { describe, expect, it } from 'vitest';

import { rewriteToolNames, ToolNameRewriteError } from '../tool-name-rewriter.ts';

describe('rewriteToolNames', () => {
  it('returns content unchanged when no placeholders are present', () => {
    const content = 'Plain text with no placeholders.';
    expect(rewriteToolNames(content, 'rovo', 'test.md')).toBe(content);
  });

  it('leaves canonical names intact for a harness that uses them', () => {
    const content = 'Use {tool:Glob}, {tool:Grep}, and {tool:Read} to explore.';
    expect(rewriteToolNames(content, 'claude', 'test.md')).toBe('Use Glob, Grep, and Read to explore.');
  });

  it('replaces placeholders with harness-native names', () => {
    const content = 'Use {tool:Glob}, {tool:Grep}, and {tool:Read} to explore.';
    expect(rewriteToolNames(content, 'rovo', 'test.md')).toBe('Use expand_folder, grep, and open_files to explore.');
  });

  it('replaces multiple placeholders on a single line', () => {
    const content = 'Not a `{tool:Read}`, not a `{tool:Grep}`, not a `{tool:Bash}` — a `{tool:Write}`.';
    expect(rewriteToolNames(content, 'rovo', 'test.md')).toBe(
      'Not a `open_files`, not a `grep`, not a `bash` — a `create_file`.',
    );
  });

  it('preserves inline-code backticks around placeholders', () => {
    const content = 'You have `{tool:Write}` but not `{tool:Edit}`.';
    expect(rewriteToolNames(content, 'claude', 'test.md')).toBe('You have `Write` but not `Edit`.');
    expect(rewriteToolNames(content, 'rovo', 'test.md')).toBe(
      'You have `create_file` but not `find_and_replace_code`.',
    );
  });

  it('throws ToolNameRewriteError for a name the harness maps nothing to', () => {
    const content = 'Use {tool:NonExistent} for nothing.';
    expect(() => rewriteToolNames(content, 'rovo', 'test.md')).toThrow(ToolNameRewriteError);
  });

  it('carries toolName, harnessId, contextLabel, and line on the error', () => {
    const content = ['Line one is fine.', 'Line two has {tool:NonExistent} on it.'].join('\n');
    try {
      rewriteToolNames(content, 'rovo', 'fixtures/sample.md');
      expect.fail('Expected ToolNameRewriteError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolNameRewriteError);
      if (!(error instanceof ToolNameRewriteError)) {
        throw error;
      }
      expect(error.toolName).toBe('NonExistent');
      expect(error.harnessId).toBe('rovo');
      expect(error.contextLabel).toBe('fixtures/sample.md');
      expect(error.line).toBe(2);
      expect(error.message).toContain('fixtures/sample.md:2');
      expect(error.message).toContain('NonExistent');
    }
  });

  it('reports a line of 1 for placeholders on the first line', () => {
    const content = '{tool:Unknown} at the very start.';
    try {
      rewriteToolNames(content, 'rovo', 'x.md');
      expect.fail('Expected ToolNameRewriteError');
    } catch (error) {
      if (!(error instanceof ToolNameRewriteError)) {
        throw error;
      }
      expect(error.line).toBe(1);
    }
  });

  it('throws on the first unmapped placeholder when content has multiple', () => {
    const content = '{tool:First} then {tool:Second}';
    try {
      rewriteToolNames(content, 'claude', 'x.md');
      expect.fail('Expected ToolNameRewriteError');
    } catch (error) {
      if (!(error instanceof ToolNameRewriteError)) {
        throw error;
      }
      expect(error.toolName).toBe('First');
    }
  });

  it('does not resolve a placeholder through the mapping object prototype', () => {
    expect(() => rewriteToolNames('Has {tool:constructor}.', 'claude', 'x.md')).toThrow(ToolNameRewriteError);
  });

  it('does not match malformed placeholders with internal whitespace', () => {
    const content = 'Not a match: {tool: Read} and {tool : Read}.';
    expect(rewriteToolNames(content, 'rovo', 'test.md')).toBe(content);
  });

  it('does not match empty placeholder content', () => {
    const content = 'Not a match: {tool:} and {tool:_leading_underscore}.';
    expect(rewriteToolNames(content, 'rovo', 'test.md')).toBe(content);
  });

  it('does not match placeholders missing the closing brace', () => {
    const content = 'Not a match: {tool:Read without close.';
    expect(rewriteToolNames(content, 'rovo', 'test.md')).toBe(content);
  });
});
