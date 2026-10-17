import { describe, expect, it } from 'vitest';

import { hashFileProse } from '../hash-prose.ts';
import type { ProseSpan } from '../types.ts';

describe(hashFileProse, () => {
  it('gives equal prose equal hashes of 16 hex characters', () => {
    const hashes = hashFileProse(
      [span('a.md', 'One sentence.'), span('b.md', 'One sentence.')],
      [scanned('a.md'), scanned('b.md')],
    );

    expect(hashes.get('a.md')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashes.get('a.md')).toBe(hashes.get('b.md'));
  });

  it('changes the hash when a span changes, or a span is added or removed', () => {
    const base = hashOne([span('a.md', 'One.'), span('a.md', 'Two.')]);

    expect(hashOne([span('a.md', 'One.'), span('a.md', 'Two!')])).not.toBe(base);
    expect(hashOne([span('a.md', 'One.')])).not.toBe(base);
    expect(hashOne([span('a.md', 'One.'), span('a.md', 'Two.'), span('a.md', 'Three.')])).not.toBe(base);
  });

  it('tells a span boundary from a newline inside a span', () => {
    expect(hashOne([span('a.md', 'One.\nTwo.')])).not.toBe(hashOne([span('a.md', 'One.'), span('a.md', 'Two.')]));
  });

  it('hashes a scanned file without spans, so prose added to it later changes its hash', () => {
    const hashes = hashFileProse([], [scanned('empty.ts')]);

    expect(hashes.get('empty.ts')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashOne([span('empty.ts', 'Now prose.')], 'empty.ts')).not.toBe(hashes.get('empty.ts'));
  });

  it('hashes only scanned files', () => {
    expect(hashFileProse([span('a.md', 'One.')], []).size).toBe(0);
  });
});

// region | Helpers

/** Hashes one file's spans and returns its hash. */
function hashOne(spans: readonly ProseSpan[], file = 'a.md'): string | undefined {
  return hashFileProse(spans, [scanned(file)]).get(file);
}

/** Builds a scanned-file entry. */
function scanned(file: string): { file: string; bytes: number } {
  return { file, bytes: 0 };
}

/** Builds a span on line 1. */
function span(file: string, text: string): ProseSpan {
  return { file, line: 1, text };
}

// endregion | Helpers
