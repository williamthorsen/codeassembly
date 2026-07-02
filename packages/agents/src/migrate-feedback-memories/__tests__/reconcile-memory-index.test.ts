import { describe, expect, it } from 'vitest';

import { removeMemoryIndexEntry } from '../reconcile-memory-index.ts';

const INDEX = `# Memory

## User preferences

- [Alpha](alpha.md): first preference
- [Beta](beta.md): second preference

## Feedback

- [Only one](feedback-only.md): the sole feedback entry

## Project

- [Proj](proj.md): a project note
`;

describe(removeMemoryIndexEntry, () => {
  it('removes the matching line and leaves the others intact', () => {
    const { content, removed } = removeMemoryIndexEntry(INDEX, 'beta.md');

    expect(removed).toBe(true);
    expect(content).not.toContain('](beta.md)');
    expect(content).toContain('](alpha.md)');
    expect(content).toContain('](proj.md)');
  });

  it('matches on the link basename, not the human title', () => {
    const { content, removed } = removeMemoryIndexEntry(INDEX, 'feedback-only.md');

    expect(removed).toBe(true);
    expect(content).not.toContain('Only one');
  });

  it('drops a section header left empty after its last entry is removed', () => {
    const { content } = removeMemoryIndexEntry(INDEX, 'feedback-only.md');

    expect(content).not.toContain('## Feedback');
    expect(content).toContain('## User preferences');
    expect(content).toContain('## Project');
  });

  it('keeps the header when a sibling entry survives', () => {
    const { content } = removeMemoryIndexEntry(INDEX, 'alpha.md');

    expect(content).toContain('## User preferences');
    expect(content).toContain('](beta.md)');
  });

  it('reports removed false and leaves content unchanged when nothing matches', () => {
    const { content, removed } = removeMemoryIndexEntry(INDEX, 'absent.md');

    expect(removed).toBe(false);
    expect(content).toBe(INDEX);
  });

  it('does not remove an entry whose basename is a substring of the target', () => {
    const index = `# Memory

## Feedback

- [Short](a.md): short one
- [Long](xa.md): long one
`;

    const { content, removed } = removeMemoryIndexEntry(index, 'a.md');

    expect(removed).toBe(true);
    expect(content).not.toContain('](a.md)');
    expect(content).toContain('](xa.md)');
  });
});
