import { describe, expect, it } from 'vitest';

import {
  checkHookEntries,
  type ClaudeHookEntry,
  ensureHookEntries,
  removeHookEntries,
} from '../claude-hook-entries.ts';

const SENTINEL = 'codeassembly:hook';

/** A matcher group as it appears in a `hooks.{Event}` array. */
function buildGroup(command: string, matcher = 'Bash'): Record<string, unknown> {
  return { matcher, hooks: [{ type: 'command', command }] };
}

const OWNED = buildGroup(`${SENTINEL} relay`);
const DRIFTED = buildGroup(`${SENTINEL} relay --old`);
const FOREIGN = buildGroup('echo foreign');

const ENTRY: ClaudeHookEntry = { event: 'PreToolUse', group: OWNED };

describe(checkHookEntries, () => {
  it.each([
    { when: 'an owned entry equals the supplied entry', hooks: { PreToolUse: [OWNED] }, status: 'present' },
    { when: 'the event holds an owned entry with other content', hooks: { PreToolUse: [DRIFTED] }, status: 'drifted' },
    { when: 'the event holds only foreign entries', hooks: { PreToolUse: [FOREIGN] }, status: 'absent' },
    { when: 'the event is absent', hooks: { PostToolUse: [OWNED] }, status: 'absent' },
  ])('reports $status when $when', ({ hooks, status }) => {
    expect(checkHookEntries({ hooks }, [ENTRY], SENTINEL)).toEqual([{ entry: ENTRY, status }]);
  });

  it('reports absent when the settings hold no hooks', () => {
    expect(checkHookEntries({ model: 'opus' }, [ENTRY], SENTINEL)).toEqual([{ entry: ENTRY, status: 'absent' }]);
  });

  it('reports present when an installed entry differs only in key order', () => {
    const reordered = { hooks: [{ command: `${SENTINEL} relay`, type: 'command' }], matcher: 'Bash' };

    expect(checkHookEntries({ hooks: { PreToolUse: [reordered] } }, [ENTRY], SENTINEL)).toEqual([
      { entry: ENTRY, status: 'present' },
    ]);
  });

  it('reports present when one of several owned entries matches', () => {
    const settings = { hooks: { PreToolUse: [DRIFTED, OWNED] } };

    expect(checkHookEntries(settings, [ENTRY], SENTINEL)).toEqual([{ entry: ENTRY, status: 'present' }]);
  });

  it('reports present for a supplied entry that ensure would keep beside an owned entry it would drop', () => {
    const stale = buildGroup(`${SENTINEL} relay --old`, 'Write');
    const settings = { hooks: { PreToolUse: [OWNED, stale] } };

    expect(checkHookEntries(settings, [ENTRY], SENTINEL)).toEqual([{ entry: ENTRY, status: 'present' }]);
    expect(ensureHookEntries(settings, [ENTRY], SENTINEL).result).toEqual({ changed: true });
  });

  it('reports each supplied entry independently', () => {
    const other: ClaudeHookEntry = { event: 'Stop', group: buildGroup(`${SENTINEL} stop`, '') };

    expect(checkHookEntries({ hooks: { PreToolUse: [OWNED] } }, [ENTRY, other], SENTINEL)).toEqual([
      { entry: ENTRY, status: 'present' },
      { entry: other, status: 'absent' },
    ]);
  });
});

describe(ensureHookEntries, () => {
  it('creates the hooks structure when the settings hold none', () => {
    const { settings, result } = ensureHookEntries({ model: 'opus' }, [ENTRY], SENTINEL);

    expect(settings).toEqual({ model: 'opus', hooks: { PreToolUse: [OWNED] } });
    expect(result).toEqual({ changed: true });
  });

  it('reports no change when the entry is already installed as supplied', () => {
    const installed = { hooks: { PreToolUse: [OWNED] } };

    const { settings, result } = ensureHookEntries(installed, [ENTRY], SENTINEL);

    expect(result).toEqual({ changed: false });
    expect(settings).toEqual(installed);
  });

  it('is a no-op when applied to its own output', () => {
    const once = ensureHookEntries({}, [ENTRY], SENTINEL);

    const twice = ensureHookEntries(once.settings, [ENTRY], SENTINEL);

    expect(twice.result).toEqual({ changed: false });
    expect(twice.settings).toEqual(once.settings);
  });

  it('replaces a drifted owned entry in its original position', () => {
    const settings = { hooks: { PreToolUse: [FOREIGN, DRIFTED, FOREIGN] } };

    const updated = ensureHookEntries(settings, [ENTRY], SENTINEL);

    expect(updated.settings).toEqual({ hooks: { PreToolUse: [FOREIGN, OWNED, FOREIGN] } });
    expect(updated.result).toEqual({ changed: true });
  });

  it('collapses duplicate owned entries into the supplied set', () => {
    const settings = { hooks: { PreToolUse: [OWNED, FOREIGN, DRIFTED] } };

    const { settings: updated } = ensureHookEntries(settings, [ENTRY], SENTINEL);

    expect(updated).toEqual({ hooks: { PreToolUse: [OWNED, FOREIGN] } });
  });

  it('appends after foreign entries when the event holds no owned entry', () => {
    const settings = { hooks: { PreToolUse: [FOREIGN] } };

    const { settings: updated } = ensureHookEntries(settings, [ENTRY], SENTINEL);

    expect(updated).toEqual({ hooks: { PreToolUse: [FOREIGN, OWNED] } });
  });

  it('installs several entries under the same event in the supplied order', () => {
    const second: ClaudeHookEntry = { event: 'PreToolUse', group: buildGroup(`${SENTINEL} audit`, 'Write') };

    const { settings } = ensureHookEntries({}, [ENTRY, second], SENTINEL);

    expect(settings).toEqual({ hooks: { PreToolUse: [OWNED, second.group] } });
  });

  it('leaves foreign events and unrelated settings keys untouched', () => {
    const settings = { model: 'opus', hooks: { Stop: [FOREIGN] }, permissions: { allow: ['Bash'] } };

    const { settings: updated } = ensureHookEntries(settings, [ENTRY], SENTINEL);

    expect(updated).toEqual({
      model: 'opus',
      hooks: { Stop: [FOREIGN], PreToolUse: [OWNED] },
      permissions: { allow: ['Bash'] },
    });
  });

  it('does not mutate the supplied settings', () => {
    const settings = { hooks: { PreToolUse: [DRIFTED] } };
    const before = structuredClone(settings);

    ensureHookEntries(settings, [ENTRY], SENTINEL);

    expect(settings).toEqual(before);
  });

  it('reports no change when no entries are supplied', () => {
    expect(ensureHookEntries({ hooks: { PreToolUse: [FOREIGN] } }, [], SENTINEL).result).toEqual({ changed: false });
  });

  it('throws when a supplied entry does not carry the sentinel', () => {
    const unmarked: ClaudeHookEntry = { event: 'PreToolUse', group: FOREIGN };

    expect(() => ensureHookEntries({}, [unmarked], SENTINEL)).toThrow(/sentinel/);
  });

  it.each([
    { when: 'the settings are not an object', settings: [OWNED], match: /JSON object/ },
    { when: 'hooks is not an object', settings: { hooks: 'all' }, match: /'hooks'/ },
    { when: 'an event value is not an array', settings: { hooks: { PreToolUse: {} } }, match: /'hooks.PreToolUse'/ },
  ])('throws when $when', ({ settings, match }) => {
    expect(() => ensureHookEntries(settings, [ENTRY], SENTINEL)).toThrow(match);
  });
});

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
    const settings = { hooks: { PreToolUse: [OWNED, DRIFTED] } };

    expect(removeHookEntries(settings, SENTINEL).result).toEqual({ changed: true, removedCount: 2 });
  });

  it('reports no change when no owned entry exists', () => {
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
