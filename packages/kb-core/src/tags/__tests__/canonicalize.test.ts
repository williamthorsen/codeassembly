import { describe, expect, it } from 'vitest';

import type { AliasMap } from '../../types.js';
import { canonicalize, findAliasFor } from '../canonicalize.js';

const ALIASES: AliasMap = new Map([
  ['git-sparse-checkout', 'git'],
  ['vcs', 'git'],
  ['node.js', 'nodejs'],
]);

describe(canonicalize, () => {
  it('returns the canonical form when the tag is a known alias', () => {
    expect(canonicalize('vcs', ALIASES)).toBe('git');
  });

  it('returns the input verbatim when the tag is unknown', () => {
    expect(canonicalize('rust', ALIASES)).toBe('rust');
  });

  it('returns the input verbatim when the tag is already canonical', () => {
    expect(canonicalize('git', ALIASES)).toBe('git');
  });

  it('resolves aliases case-insensitively', () => {
    expect(canonicalize('VCS', ALIASES)).toBe('git');
  });
});

describe(findAliasFor, () => {
  it('returns the canonical form when the tag is a known alias', () => {
    expect(findAliasFor('node.js', ALIASES)).toBe('nodejs');
  });

  it('returns null when the tag is unknown', () => {
    expect(findAliasFor('rust', ALIASES)).toBeNull();
  });

  it('returns null when the tag is already canonical', () => {
    expect(findAliasFor('git', ALIASES)).toBeNull();
  });

  it('resolves aliases case-insensitively', () => {
    expect(findAliasFor('Node.JS', ALIASES)).toBe('nodejs');
  });
});
