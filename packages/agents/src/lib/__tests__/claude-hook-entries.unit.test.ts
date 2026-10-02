import { describe, expect, it } from 'vitest';

import { removeHookEntries } from '../claude-hook-entries.ts';

const SENTINEL = 'codeassembly:hook';

/** A matcher group as it appears in a `hooks.{Event}` array. */
function buildGroup(command: string, matcher = 'Bash'): Record<string, unknown> {
  return { matcher, hooks: [{ type: 'command', command }] };
}

const OWNED = buildGroup(`${SENTINEL} relay`);
const OTHER_OWNED = buildGroup(`${SENTINEL} relay --old`);
const FOREIGN = buildGroup('echo foreign');

describe(removeHookEntries, () => {
  it('deletes the owned entry and prunes the emptied event and hooks key', () => {
    const settings = { model: 'opus', hooks: { PreToolUse: [OWNED] } };

    const { settings: updated, result } = removeHookEntries(settings, SENTINEL);

    expect(updated).toEqual({ model: 'opus' });
    expect(result).toEqual({ changed: true, removedCount: 1 });
  });

  it('keeps the event when foreign entries remain in it', () => {
    const settings = { hooks: { PreToolUse: [FOREIGN, OWNED], Stop: [OWNED] } };

    const { settings: updated, result } = removeHookEntries(settings, SENTINEL);

    expect(updated).toEqual({ hooks: { PreToolUse: [FOREIGN] } });
    expect(result).toEqual({ changed: true, removedCount: 2 });
  });

  it('deletes every owned entry under an event, whatever its content', () => {
    const settings = { hooks: { PreToolUse: [OWNED, OTHER_OWNED] } };

    expect(removeHookEntries(settings, SENTINEL).result).toEqual({ changed: true, removedCount: 2 });
  });

  it('reports unchanged when the settings do not contain an owned entry', () => {
    const settings = { hooks: { PreToolUse: [FOREIGN] } };

    const { settings: updated, result } = removeHookEntries(settings, SENTINEL);

    expect(updated).toEqual(settings);
    expect(result).toEqual({ changed: false, removedCount: 0 });
  });

  it('preserves an event array that was already empty', () => {
    const settings = { hooks: { PreToolUse: [], Stop: [OWNED] } };

    expect(removeHookEntries(settings, SENTINEL).settings).toEqual({ hooks: { PreToolUse: [] } });
  });

  it('does not mutate the supplied settings', () => {
    const settings = { hooks: { PreToolUse: [OWNED, FOREIGN] } };
    const before = structuredClone(settings);

    removeHookEntries(settings, SENTINEL);

    expect(settings).toEqual(before);
  });

  it.each([
    { when: 'the settings are not an object', settings: 'nope', match: /JSON object/ },
    { when: 'hooks is not an object', settings: { hooks: 'all' }, match: /'hooks'/ },
    { when: 'an event value is not an array', settings: { hooks: { Stop: 3 } }, match: /'hooks.Stop'/ },
  ])('throws when $when', ({ settings, match }) => {
    expect(() => removeHookEntries(settings, SENTINEL)).toThrow(match);
  });
});
