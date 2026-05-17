import { describe, expect, it } from 'vitest';

import { loadToolMapping, rewriteToolNames, ToolNameRewriteError } from '../tool-name-rewriter.js';

const IDENTITY = new Map<string, string>([
  ['Bash', 'Bash'],
  ['Edit', 'Edit'],
  ['Glob', 'Glob'],
  ['Grep', 'Grep'],
  ['Read', 'Read'],
  ['Write', 'Write'],
]);

const ROVODEV = new Map<string, string>([
  ['Bash', 'bash'],
  ['Edit', 'find_and_replace_code'],
  ['Glob', 'expand_folder'],
  ['Grep', 'grep'],
  ['Read', 'open_files'],
  ['Write', 'create_file'],
]);

describe('rewriteToolNames', () => {
  it('should return content unchanged when no placeholders are present', () => {
    const content = 'Plain text with no placeholders.';
    expect(rewriteToolNames(content, ROVODEV, 'test.md')).toBe(content);
  });

  it('should leave canonical names intact when given an identity mapping', () => {
    const content = 'Use {tool:Glob}, {tool:Grep}, and {tool:Read} to explore.';
    expect(rewriteToolNames(content, IDENTITY, 'test.md')).toBe('Use Glob, Grep, and Read to explore.');
  });

  it('should replace placeholders with platform-native names for a non-identity mapping', () => {
    const content = 'Use {tool:Glob}, {tool:Grep}, and {tool:Read} to explore.';
    expect(rewriteToolNames(content, ROVODEV, 'test.md')).toBe('Use expand_folder, grep, and open_files to explore.');
  });

  it('should replace multiple placeholders on a single line', () => {
    const content = 'Not a `{tool:Read}`, not a `{tool:Grep}`, not a `{tool:Bash}` — a `{tool:Write}`.';
    expect(rewriteToolNames(content, ROVODEV, 'test.md')).toBe(
      'Not a `open_files`, not a `grep`, not a `bash` — a `create_file`.',
    );
  });

  it('should preserve inline-code backticks around placeholders', () => {
    const content = 'You have `{tool:Write}` but not `{tool:Edit}`.';
    expect(rewriteToolNames(content, IDENTITY, 'test.md')).toBe('You have `Write` but not `Edit`.');
    expect(rewriteToolNames(content, ROVODEV, 'test.md')).toBe(
      'You have `create_file` but not `find_and_replace_code`.',
    );
  });

  it('should throw ToolNameRewriteError for an unmapped name', () => {
    const content = 'Use {tool:NonExistent} for nothing.';
    expect(() => rewriteToolNames(content, ROVODEV, 'test.md')).toThrow(ToolNameRewriteError);
  });

  it('should carry toolName, contextLabel, and line on the error', () => {
    const content = ['Line one is fine.', 'Line two has {tool:NonExistent} on it.'].join('\n');
    try {
      rewriteToolNames(content, ROVODEV, 'fixtures/sample.md');
      expect.fail('Expected ToolNameRewriteError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolNameRewriteError);
      if (!(error instanceof ToolNameRewriteError)) {
        throw error;
      }
      expect(error.toolName).toBe('NonExistent');
      expect(error.contextLabel).toBe('fixtures/sample.md');
      expect(error.line).toBe(2);
      expect(error.message).toContain('fixtures/sample.md:2');
      expect(error.message).toContain('NonExistent');
    }
  });

  it('should report a line of 1 for placeholders on the first line', () => {
    const content = '{tool:Unknown} at the very start.';
    try {
      rewriteToolNames(content, ROVODEV, 'x.md');
      expect.fail('Expected ToolNameRewriteError');
    } catch (error) {
      if (!(error instanceof ToolNameRewriteError)) {
        throw error;
      }
      expect(error.line).toBe(1);
    }
  });

  it('should throw on the first unmapped placeholder when content has multiple', () => {
    const content = '{tool:First} then {tool:Second}';
    try {
      rewriteToolNames(content, new Map([['Second', 'second']]), 'x.md');
      expect.fail('Expected ToolNameRewriteError');
    } catch (error) {
      if (!(error instanceof ToolNameRewriteError)) {
        throw error;
      }
      expect(error.toolName).toBe('First');
    }
  });

  it('should not match malformed placeholders with internal whitespace', () => {
    const content = 'Not a match: {tool: Read} and {tool : Read}.';
    expect(rewriteToolNames(content, ROVODEV, 'test.md')).toBe(content);
  });

  it('should not match empty placeholder content', () => {
    const content = 'Not a match: {tool:} and {tool:_leading_underscore}.';
    expect(rewriteToolNames(content, ROVODEV, 'test.md')).toBe(content);
  });

  it('should not match placeholders missing the closing brace', () => {
    const content = 'Not a match: {tool:Read without close.';
    expect(rewriteToolNames(content, ROVODEV, 'test.md')).toBe(content);
  });

  it('should throw on empty mapping when any placeholder is present', () => {
    expect(() => rewriteToolNames('Has {tool:Read}.', new Map(), 'x.md')).toThrow(ToolNameRewriteError);
  });

  it('should leave content unchanged with empty mapping when no placeholders are present', () => {
    const content = 'No placeholders here.';
    expect(rewriteToolNames(content, new Map(), 'x.md')).toBe(content);
  });
});

describe('loadToolMapping', () => {
  it('should return an empty map for an empty YAML string', () => {
    expect(loadToolMapping('')).toEqual(new Map());
    expect(loadToolMapping('   \n  \n')).toEqual(new Map());
  });

  it('should return an empty map when _tools key is absent', () => {
    const overlay = ['_defaults:', '  permissionMode: bypassPermissions'].join('\n');
    expect(loadToolMapping(overlay)).toEqual(new Map());
  });

  it('should return an empty map when _tools is null or empty', () => {
    expect(loadToolMapping('_tools:')).toEqual(new Map());
    expect(loadToolMapping('_tools: {}')).toEqual(new Map());
  });

  it('should parse a populated _tools mapping', () => {
    const overlay = ['_tools:', '  Bash: bash', '  Read: open_files', '  Write: create_file'].join('\n');
    const result = loadToolMapping(overlay);
    expect(result.size).toBe(3);
    expect(result.get('Bash')).toBe('bash');
    expect(result.get('Read')).toBe('open_files');
    expect(result.get('Write')).toBe('create_file');
  });

  it('should ignore other top-level keys', () => {
    const overlay = [
      '_defaults:',
      '  permissionMode: bypassPermissions',
      '',
      '_tools:',
      '  Read: open_files',
      '',
      'plan-reviewer:',
      '  model: sonnet',
    ].join('\n');
    const result = loadToolMapping(overlay);
    expect(result.get('Read')).toBe('open_files');
    expect(result.size).toBe(1);
  });

  it('should throw when _tools is not an object', () => {
    expect(() => loadToolMapping('_tools: notAnObject')).toThrow(/_tools/);
    expect(() => loadToolMapping('_tools: [a, b, c]')).toThrow(/_tools/);
  });

  it('should throw when a _tools entry value is not a string', () => {
    expect(() => loadToolMapping(['_tools:', '  Read: 42'].join('\n'))).toThrow(/Read/);
  });
});
