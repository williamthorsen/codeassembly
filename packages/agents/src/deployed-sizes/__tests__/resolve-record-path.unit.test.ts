import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRecordPath } from '../resolve-record-path.ts';

const HOME = '/home/agent';

const ROOT = path.join(HOME, '.codeassembly', 'deployed-sizes');

describe(resolveRecordPath, () => {
  it('resolves a repo domain to its owner directory and name file', () => {
    expect(resolveRecordPath({ home: HOME, repo: 'williamthorsen/codeassembly' })).toBe(
      path.join(ROOT, 'williamthorsen', 'codeassembly.jsonl'),
    );
  });

  it('resolves the home domain to the record that belongs to no repo', () => {
    expect(resolveRecordPath({ home: HOME })).toBe(path.join(ROOT, '_home.jsonl'));
  });

  it('substitutes the placeholder for a repo that is not owner/name', () => {
    expect(resolveRecordPath({ home: HOME, repo: 'bare-name' })).toBe(path.join(ROOT, 'bare-name', '_no-repo.jsonl'));
  });

  it('substitutes the placeholder for an owner that would traverse upward', () => {
    expect(resolveRecordPath({ home: HOME, repo: '../escape' })).toBe(path.join(ROOT, '_no-repo', 'escape.jsonl'));
  });
});
