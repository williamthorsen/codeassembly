import { describe, expect, it } from 'vitest';

import type { KbRegistryEntry } from '../../types.ts';
import { formatKbSelection, parseSelection } from '../select-kb-prompt.ts';

const entries: KbRegistryEntry[] = [
  { name: 'coding', path: '/abs/coding', source: 'user' },
  { name: 'notes', path: '/abs/notes', source: 'user' },
];

describe(formatKbSelection, () => {
  it('numbers each KB and appends a (none) option', () => {
    const text = formatKbSelection(entries);

    expect(text).toContain('1) coding');
    expect(text).toContain('2) notes');
    expect(text).toContain('3) (none) — no default');
  });

  it('marks the current default', () => {
    const text = formatKbSelection(entries, 'notes');

    expect(text).toContain('2) notes  (current default)');
    expect(text).not.toContain('coding  (current default)');
  });

  it('marks (none) as current when no default is set', () => {
    const text = formatKbSelection(entries, undefined);

    expect(text).toContain('(none) — no default  (current)');
  });
});

describe(parseSelection, () => {
  it('treats an empty answer as cancel', () => {
    expect(parseSelection('', 2)).toEqual({ kind: 'cancel' });
  });

  it('maps an in-range number to a 0-based KB index', () => {
    expect(parseSelection('1', 2)).toEqual({ kind: 'kb', index: 0 });
    expect(parseSelection('2', 2)).toEqual({ kind: 'kb', index: 1 });
  });

  it('maps the trailing number to none', () => {
    expect(parseSelection('3', 2)).toEqual({ kind: 'none' });
  });

  it('returns null for out-of-range or non-numeric input', () => {
    expect(parseSelection('0', 2)).toBeNull();
    expect(parseSelection('4', 2)).toBeNull();
    expect(parseSelection('abc', 2)).toBeNull();
    expect(parseSelection('1.5', 2)).toBeNull();
  });
});
