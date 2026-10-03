import { describe, expect, it } from 'vitest';

import { resolveTerminalWidth } from '../resolve-terminal-width.ts';

describe(resolveTerminalWidth, () => {
  it('returns the reported width of a TTY stream', () => {
    expect(resolveTerminalWidth({ isTTY: true, columns: 73 })).toBe(73);
  });

  it('falls back for a stream that is not a TTY', () => {
    expect(resolveTerminalWidth({ isTTY: false, columns: 73 })).toBe(120);
  });

  it('falls back for a TTY stream that does not report a width', () => {
    expect(resolveTerminalWidth({ isTTY: true })).toBe(120);
  });

  it('falls back for a stream that does not declare a TTY flag', () => {
    expect(resolveTerminalWidth({})).toBe(120);
  });
});
