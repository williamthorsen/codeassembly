import { describe, expect, it } from 'vitest';

import { listRelayHooks } from '../../relay-hook-event/hook-mappings.ts';
import { buildClaudeHookEntries, buildRovoHookEntries, HOOK_SENTINEL, isSentinelOwned } from '../hook-entry-catalog.ts';
import { isRecord } from '../type-guards.ts';

/** Reads the single command string out of a Claude matcher group, asserting the group's expected shape. */
function readClaudeCommand(group: Record<string, unknown>): string {
  const hooks = group.hooks;
  if (!Array.isArray(hooks) || hooks.length !== 1) {
    throw new Error('Expected the matcher group to hold exactly one hook');
  }
  const hook: unknown = hooks[0];
  if (!isRecord(hook) || typeof hook.command !== 'string') {
    throw new Error('Expected the hook to carry a command string');
  }
  return hook.command;
}

describe(buildClaudeHookEntries, () => {
  it('builds one entry per relayed Claude hook, in relay order', () => {
    const entries = buildClaudeHookEntries();

    expect(entries.map((entry) => entry.event)).toEqual([...listRelayHooks('claude')]);
  });

  it('bakes the hook identity, a tilde relay path, and the sentinel into each command', () => {
    for (const entry of buildClaudeHookEntries()) {
      const command = readClaudeCommand(entry.group);
      expect(command).toContain('node ~/.claude/scripts/relay-hook-event.mjs');
      expect(command).toContain('--harness claude');
      expect(command).toContain(`--hook ${entry.event}`);
      expect(command).toContain(HOOK_SENTINEL);
    }
  });

  it('declares matcher-free groups, so every start source and end reason relays', () => {
    for (const entry of buildClaudeHookEntries()) {
      expect(Object.keys(entry.group)).toEqual(['hooks']);
    }
  });
});

describe(buildRovoHookEntries, () => {
  it('builds one entry per relayed Rovo hook, named by the hook, in relay order', () => {
    const entries = buildRovoHookEntries('/home/user/.rovodev/scripts');

    expect(entries.map((entry) => entry.name)).toEqual([...listRelayHooks('rovo')]);
  });

  it('bakes the hook identity, the absolute relay path, and the sentinel into each command', () => {
    for (const entry of buildRovoHookEntries('/home/user/.rovodev/scripts')) {
      expect(entry.commands).toHaveLength(1);
      const command = entry.commands[0] ?? '';
      expect(command).toContain('node /home/user/.rovodev/scripts/relay-hook-event.mjs');
      expect(command).toContain('--harness rovo');
      expect(command).toContain(`--hook ${entry.name}`);
      expect(command).toContain(HOOK_SENTINEL);
    }
  });

  it('produces entries the sentinel matcher claims', () => {
    for (const entry of buildRovoHookEntries('/home/user/.rovodev/scripts')) {
      expect(isSentinelOwned(entry)).toBe(true);
    }
  });

  it('does not claim a foreign entry that merely mentions the CLI name', () => {
    expect(isSentinelOwned({ name: 'on_complete', commands: ['codeassembly status'] })).toBe(false);
  });

  it('keeps the sentinel value frozen', () => {
    // Asserted as a literal: every other assertion in this file compares against the constant and
    // would pass for any value.
    expect(HOOK_SENTINEL).toBe('--sentinel codeassembly-agents');
  });
});
