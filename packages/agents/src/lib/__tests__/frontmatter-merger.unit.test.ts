import { describe, expect, it } from 'vitest';

import { mergeFrontmatter, parseFrontmatter, parseOverlayOverrides } from '../frontmatter-merger.ts';

describe('parseFrontmatter', () => {
  it('should extract agent name from frontmatter', () => {
    const content = ['---', 'name: test-agent', 'description: A test agent', '---', '', '# Body'].join('\n');

    const result = parseFrontmatter(content);
    expect(result.agentName).toBe('test-agent');
    expect(result.lines).toEqual(['name: test-agent', 'description: A test agent']);
    expect(result.body).toBe('\n# Body');
  });

  it('should handle multi-line body', () => {
    const content = ['---', 'name: test-agent', '---', '', '# Body', '', 'More content'].join('\n');

    const result = parseFrontmatter(content);
    expect(result.body).toBe('\n# Body\n\nMore content');
  });
});

describe('parseOverlayOverrides', () => {
  it('should return empty overrides for empty YAML', () => {
    const result = parseOverlayOverrides('', 'some-agent');
    expect(result).toEqual({});
  });

  it('should apply _defaults only when agent is not listed', () => {
    const overlay = ['_defaults:', '  permissionMode: bypassPermissions', '', 'other-agent:', '  model: sonnet'].join(
      '\n',
    );

    const result = parseOverlayOverrides(overlay, 'unlisted-agent');
    expect(result).toEqual({ permissionMode: 'bypassPermissions' });
  });

  it('should merge _defaults and agent-specific overrides', () => {
    const overlay = [
      '_defaults:',
      '  permissionMode: bypassPermissions',
      '',
      'orchestrated-coder:',
      '  model: inherit',
      '  memory: user',
    ].join('\n');

    const result = parseOverlayOverrides(overlay, 'orchestrated-coder');
    expect(result).toEqual({
      permissionMode: 'bypassPermissions',
      model: 'inherit',
      memory: 'user',
    });
  });

  it('should let agent-specific values override defaults', () => {
    const overlay = ['_defaults:', '  model: default-model', '', 'my-agent:', '  model: override-model'].join('\n');

    const result = parseOverlayOverrides(overlay, 'my-agent');
    expect(result).toEqual({ model: 'override-model' });
  });

  it('should handle empty agent section (inherits defaults only)', () => {
    const overlay = ['_defaults:', '  tools: [bash, grep]', '', 'aspect-code-reviewer: {}'].join('\n');

    const result = parseOverlayOverrides(overlay, 'aspect-code-reviewer');
    expect(result).toEqual({ tools: '[bash, grep]' });
  });

  it('should serialize array values as flow sequences', () => {
    const overlay = [
      '_defaults:',
      '  tools: [bash, create_file, expand_code_chunks, expand_folder, grep, open_files]',
    ].join('\n');

    const result = parseOverlayOverrides(overlay, 'any-agent');
    expect(result.tools).toBe('[bash, create_file, expand_code_chunks, expand_folder, grep, open_files]');
  });
});

describe('mergeFrontmatter', () => {
  it('should return source unchanged when no overrides match the agent', () => {
    const source = ['---', 'name: unknown-agent', 'description: An unknown agent', '---', '', '# Body', ''].join('\n');

    const overlay = ['_defaults: {}'].join('\n');

    const result = mergeFrontmatter(source, overlay);
    expect(result).toBe(source);
  });

  it('should add defaults when agent is not in overlay', () => {
    const source = [
      '---',
      'name: orchestrated-architect',
      'description: Test',
      'tools: [Read, Grep]',
      '---',
      '',
      '# Body',
      '',
    ].join('\n');

    const overlay = ['_defaults:', '  permissionMode: bypassPermissions', '', 'other-agent:', '  model: sonnet'].join(
      '\n',
    );

    const result = mergeFrontmatter(source, overlay);
    expect(result).toContain('permissionMode: bypassPermissions');
    // permissionMode is new, so it should be appended
    const lines = result.split('\n');
    const fmEndIdx = lines.indexOf('---', 1);
    const lastFmLine = lines[fmEndIdx - 1];
    expect(lastFmLine).toBe('permissionMode: bypassPermissions');
  });

  it('should replace existing keys in-place', () => {
    const source = ['---', 'name: test-agent', 'tools: [Read, Write]', 'maxTurns: 30', '---', '', '# Body', ''].join(
      '\n',
    );

    const overlay = ['_defaults:', '  tools: [bash, grep]'].join('\n');

    const result = mergeFrontmatter(source, overlay);
    const lines = result.split('\n');
    // tools should be in the same position (line index 2, between name and maxTurns)
    expect(lines[2]).toBe('tools: [bash, grep]');
    expect(lines[3]).toBe('maxTurns: 30');
  });

  it('should append new keys sorted alphabetically', () => {
    const source = ['---', 'name: test-agent', 'tools: [Read, Write]', '---', '', '# Body', ''].join('\n');

    const overlay = [
      '_defaults:',
      '  permissionMode: bypassPermissions',
      '',
      'test-agent:',
      '  model: sonnet',
      '  memory: user',
    ].join('\n');

    const result = mergeFrontmatter(source, overlay);
    const lines = result.split('\n');
    // Existing keys stay in place, new keys appended sorted
    expect(lines[1]).toBe('name: test-agent');
    expect(lines[2]).toBe('tools: [Read, Write]');
    // New keys sorted: memory, model, permissionMode
    expect(lines[3]).toBe('memory: user');
    expect(lines[4]).toBe('model: sonnet');
    expect(lines[5]).toBe('permissionMode: bypassPermissions');
    expect(lines[6]).toBe('---');
  });
});
