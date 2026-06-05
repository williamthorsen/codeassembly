import { describe, expect, it } from 'vitest';

import { documentFor, parseNoteContent } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import { pathsRule } from '../paths-rule.ts';

function check(content: string) {
  const note = parseNoteContent({ content, path: 'note.md' });
  return pathsRule.check({ note, document: documentFor(note), schema: defaultSchema });
}

describe('pathsRule', () => {
  it('returns no findings when content has no /Users/ paths', () => {
    expect(check('See ~/repos/foo for details.')).toEqual([]);
  });

  it('flags a /Users/{name}/ path as an error', () => {
    const findings = check('Run cd /Users/william/repos and try again.');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('paths.user-home');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('/Users/william/');
  });

  it('reports each occurrence separately', () => {
    const findings = check('/Users/alice/foo and /Users/bob/bar');
    expect(findings).toHaveLength(2);
  });

  it('reports the line of the occurrence', () => {
    const content = ['Line one.', 'Path is /Users/william/x here.', 'Line three.'].join('\n');
    const findings = check(content);
    expect(findings[0]?.line).toBe(2);
  });

  it('also flags paths inside the frontmatter', () => {
    const content = ['---', 'sources: ["/Users/x/notes"]', '---', 'Body'].join('\n');
    const findings = check(content);
    expect(findings.length).toBeGreaterThan(0);
  });
});
