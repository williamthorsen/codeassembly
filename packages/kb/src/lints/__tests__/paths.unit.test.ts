import { describe, expect, it } from 'vitest';

import { pathsFindings } from '../paths.ts';

describe(pathsFindings, () => {
  it('flags a hardcoded /Users/{name}/ path as an error', () => {
    const findings = pathsFindings({ path: 'a.md', content: 'See /Users/alice/repo for details.' });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('paths.user-home');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('/Users/alice/');
    expect(findings[0]?.line).toBe(1);
  });

  it('reports each occurrence at its line', () => {
    const content = ['first line', 'path /Users/bob/x here', 'third', 'again /Users/bob/y'].join('\n');
    const findings = pathsFindings({ path: 'a.md', content });
    expect(findings.map((finding) => finding.line)).toEqual([2, 4]);
  });

  it('passes content that uses ~/ instead of a home path', () => {
    expect(pathsFindings({ path: 'a.md', content: 'Use ~/repo instead.' })).toEqual([]);
  });

  it('flags a home path inside a code fence, scanning raw content', () => {
    const content = ['```bash', 'cd /Users/carol/project', '```'].join('\n');
    const findings = pathsFindings({ path: 'a.md', content });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
  });
});
