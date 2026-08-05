import { describe, expect, it } from 'vitest';

import { parseRemoteToOwnerRepo } from '../parse-remote-url.ts';

describe(parseRemoteToOwnerRepo, () => {
  it('parses an SSH remote to owner/repo', () => {
    expect(parseRemoteToOwnerRepo('git@github.com:williamthorsen/codeassembly.git')).toBe(
      'williamthorsen/codeassembly',
    );
  });

  it('parses an HTTPS remote to owner/repo', () => {
    expect(parseRemoteToOwnerRepo('https://github.com/williamthorsen/codeassembly.git')).toBe(
      'williamthorsen/codeassembly',
    );
  });

  it('strips a missing .git suffix gracefully', () => {
    expect(parseRemoteToOwnerRepo('https://github.com/williamthorsen/codeassembly')).toBe(
      'williamthorsen/codeassembly',
    );
  });

  it('reduces a nested path to its last two segments', () => {
    expect(parseRemoteToOwnerRepo('https://gitlab.com/group/subgroup/project.git')).toBe('subgroup/project');
  });

  it('returns null for a single-segment path with no owner/repo pair', () => {
    expect(parseRemoteToOwnerRepo('https://github.com/onlyone.git')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(parseRemoteToOwnerRepo('not-a-url')).toBeNull();
  });
});
