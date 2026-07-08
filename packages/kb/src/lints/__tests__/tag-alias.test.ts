import { describe, expect, it } from 'vitest';

import type { AliasMap } from '../../types.ts';
import { tagAliasFindings } from '../tag-alias.ts';

describe(tagAliasFindings, () => {
  it('warns when a tag is a known alias, naming the canonical form', () => {
    const findings = tagAliasFindings({ path: 'a.md', fields: { tags: ['js'] } }, aliasesOf([['js', 'javascript']]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('tag-alias');
    expect(findings[0]?.severity).toBe('warning');
    expect(findings[0]?.message).toContain('javascript');
  });

  it('points the finding at the note, with no exact line', () => {
    const [finding] = tagAliasFindings({ path: 'a.md', fields: { tags: ['js'] } }, aliasesOf([['js', 'javascript']]));
    expect(finding?.line).toBeUndefined();
    expect(finding?.path).toBe('a.md');
  });

  it('resolves aliases case-insensitively', () => {
    const findings = tagAliasFindings({ path: 'a.md', fields: { tags: ['JS'] } }, aliasesOf([['js', 'javascript']]));
    expect(findings).toHaveLength(1);
  });

  it('passes a canonical tag', () => {
    const aliases = aliasesOf([['js', 'javascript']]);
    expect(tagAliasFindings({ path: 'a.md', fields: { tags: ['javascript'] } }, aliases)).toEqual([]);
  });

  it('passes an unknown, new-vocabulary tag', () => {
    const aliases = aliasesOf([['js', 'javascript']]);
    expect(tagAliasFindings({ path: 'a.md', fields: { tags: ['rust'] } }, aliases)).toEqual([]);
  });

  it('flags each aliased tag in list order', () => {
    const aliases = aliasesOf([
      ['js', 'javascript'],
      ['ts', 'typescript'],
    ]);
    const findings = tagAliasFindings({ path: 'a.md', fields: { tags: ['js', 'rust', 'ts'] } }, aliases);
    expect(findings.map((finding) => finding.message)).toEqual([
      'tag "js" is an alias — use canonical form "javascript"',
      'tag "ts" is an alias — use canonical form "typescript"',
    ]);
  });

  it('yields no findings when tags is absent', () => {
    expect(tagAliasFindings({ path: 'a.md', fields: {} }, aliasesOf([['js', 'javascript']]))).toEqual([]);
  });

  it('yields no findings when tags is not a list', () => {
    expect(tagAliasFindings({ path: 'a.md', fields: { tags: 'js' } }, aliasesOf([['js', 'javascript']]))).toEqual([]);
  });

  it('yields no findings when no aliases are configured', () => {
    expect(tagAliasFindings({ path: 'a.md', fields: { tags: ['js'] } }, aliasesOf([]))).toEqual([]);
  });
});

// region | Helpers

function aliasesOf(entries: Array<[string, string]>): AliasMap {
  return new Map(entries);
}

// endregion | Helpers
