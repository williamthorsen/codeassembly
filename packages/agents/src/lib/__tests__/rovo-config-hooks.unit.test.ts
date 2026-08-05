import { describe, expect, it } from 'vitest';
import { type Document, isSeq, parseDocument } from 'yaml';

import {
  checkHookEntries,
  ensureHookEntries,
  type HookEntry,
  type HookSentinelMatcher,
  removeHookEntries,
  RovoConfigParseError,
} from '../rovo-config-hooks.ts';

/** A test sentinel: ownership is marked by a `--ca` token in any command. Encoding is the caller's choice. */
const isOwned: HookSentinelMatcher = (entry) => entry.commands.some((command) => command.includes('--ca'));

/** The shape the vendor documents and real configs use: a list of `{name, commands: [{command}]}` items. */
const VENDOR_SHAPED_CONFIG = [
  'eventHooks:',
  '  logFile: "~/.rovodev/event_hooks.log"',
  '  events:',
  '    - name: on_complete',
  '      commands:',
  "        - command: echo 'Agent run finished'",
  '    - name: on_session_end',
  '      commands:',
  "        - command: echo 'Session ended'",
  '',
].join('\n');

/** Builds an owned entry for the named hook event, carrying the sentinel token. */
function buildOwnedEntry(name: string): HookEntry {
  return { name, commands: [`run ${name} --ca`] };
}

/** The number of items in the events list, or -1 when it is missing or malformed. */
function eventsLength(document: Document): number {
  const array = document.getIn(['eventHooks', 'events']);
  return isSeq(array) ? array.items.length : -1;
}

/** Parses YAML source into a document, preserving any parse errors for the parse-guard tests. */
function parseConfig(source: string): Document {
  return parseDocument(source);
}

describe(ensureHookEntries, () => {
  it('creates eventHooks and the events list when the document is empty', () => {
    const document = parseConfig('');
    const result = ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);

    expect(result.changed).toBe(true);
    expect(String(document)).toContain('eventHooks:');
    expect(checkHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned)[0]?.status).toBe('present');
  });

  it('writes each command string wrapped as a {command} map', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);

    expect(String(document)).toContain('- command: run on_session_start --ca');
  });

  it('is a no-op on an immediate re-run', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);

    expect(ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned).changed).toBe(false);
  });

  it('replaces a drifted owned entry in place rather than duplicating it', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);

    const drifted: HookEntry = { name: 'on_session_start', commands: ['run on_session_start --ca --extra'] };
    const result = ensureHookEntries(document, [drifted], isOwned);

    expect(result.changed).toBe(true);
    expect(eventsLength(document)).toBe(1);
    expect(String(document)).toContain('--extra');
  });

  it('installs entries for several events, keeps a re-run a no-op, and drifts only one', () => {
    const document = parseConfig('');
    const both = [buildOwnedEntry('on_session_start'), buildOwnedEntry('on_session_end')];

    expect(ensureHookEntries(document, both, isOwned).changed).toBe(true);
    expect(eventsLength(document)).toBe(2);

    expect(ensureHookEntries(document, both, isOwned).changed).toBe(false);

    const drifted: HookEntry[] = [
      buildOwnedEntry('on_session_start'),
      { name: 'on_session_end', commands: ['run on_session_end --ca --v2'] },
    ];
    expect(ensureHookEntries(document, drifted, isOwned).changed).toBe(true);
    expect(eventsLength(document)).toBe(2);

    const statuses = checkHookEntries(document, drifted, isOwned).map((check) => check.status);
    expect(statuses).toEqual(['present', 'present']);
  });

  it('throws when a supplied entry does not satisfy the sentinel matcher', () => {
    const document = parseConfig('');
    const unsentineled: HookEntry = { name: 'on_session_start', commands: ['run plain'] };

    expect(() => ensureHookEntries(document, [unsentineled], isOwned)).toThrow(/sentinel/);
    expect(String(document)).not.toContain('eventHooks');
  });

  it('adds owned entries to a vendor-shaped config without disturbing its entries or keys', () => {
    const document = parseConfig(VENDOR_SHAPED_CONFIG);

    const result = ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);
    const out = String(document);

    expect(result.changed).toBe(true);
    expect(eventsLength(document)).toBe(3);
    expect(out).toContain('logFile: "~/.rovodev/event_hooks.log"');
    expect(out).toContain("echo 'Agent run finished'");
    expect(out).toContain("echo 'Session ended'");
    expect(out).toContain('run on_session_start --ca');
  });

  it('leaves foreign entries, foreign comments, and unrelated keys untouched', () => {
    const source = [
      '# top comment',
      'otherKey: 42 # inline comment',
      'eventHooks:',
      '  events:',
      '    - name: on_session_start # foreign inline',
      '      commands:',
      '        - command: echo hi',
      '',
    ].join('\n');
    const document = parseConfig(source);

    ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);
    const out = String(document);

    expect(out).toContain('# top comment');
    expect(out).toContain('42 # inline comment');
    expect(out).toContain('on_session_start # foreign inline');
    expect(out).toContain('echo hi');
    expect(out).toContain('run on_session_start --ca');
  });

  it('matches and mutates owned entries interleaved with foreign entries', () => {
    const source = [
      'eventHooks:',
      '  events:',
      '    - name: on_session_start',
      '      commands:',
      '        - command: echo a',
      '    - name: on_session_start',
      '      commands:',
      '        - command: run start --ca',
      '    - name: on_session_end',
      '      commands:',
      '        - command: run end --ca',
      '    - name: on_session_end',
      '      commands:',
      '        - command: echo b',
      '',
    ].join('\n');
    const document = parseConfig(source);

    const drifted: HookEntry[] = [
      { name: 'on_session_start', commands: ['run start --ca --v2'] },
      { name: 'on_session_end', commands: ['run end --ca --v2'] },
    ];
    const result = ensureHookEntries(document, drifted, isOwned);
    const out = String(document);

    expect(result.changed).toBe(true);
    expect(eventsLength(document)).toBe(4);
    expect(out).toContain('run start --ca --v2');
    expect(out).toContain('run end --ca --v2');
    expect(out).toContain('command: echo a');
    expect(out).toContain('command: echo b');
  });

  it('throws on a map-shaped events value rather than treating it as empty', () => {
    const source = [
      'eventHooks:',
      '  events:',
      '    on_session_start:',
      '      - name: a',
      '        commands:',
      '          - command: run a --ca',
      '',
    ].join('\n');
    const document = parseConfig(source);

    expect(() => ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned)).toThrow(/list/);
  });
});

describe(checkHookEntries, () => {
  it('reports present, drifted, and absent by name', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);

    const results = checkHookEntries(
      document,
      [
        buildOwnedEntry('on_session_start'),
        { name: 'on_session_start', commands: ['run on_session_start --ca --changed'] },
      ],
      isOwned,
    );

    expect(results[0]?.status).toBe('present');
    expect(results[1]?.status).toBe('drifted');
  });

  it('reports absent when the document holds no owned entries', () => {
    const document = parseConfig(VENDOR_SHAPED_CONFIG);

    const result = checkHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);
    expect(result[0]?.status).toBe('absent');
  });

  it('reports drifted when owned entries exist but none matches the supplied name', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);

    const result = checkHookEntries(document, [buildOwnedEntry('on_session_end')], isOwned);
    expect(result[0]?.status).toBe('drifted');
  });

  it('reports drifted when an owned entry carries a hand-added extra key', () => {
    const source = [
      'eventHooks:',
      '  events:',
      '    - name: on_session_start',
      '      commands:',
      '        - command: run on_session_start --ca',
      '          timeout: 5',
      '',
    ].join('\n');
    const document = parseConfig(source);

    const result = checkHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);
    expect(result[0]?.status).toBe('drifted');
  });
});

describe(removeHookEntries, () => {
  it('deletes only owned entries, preserving foreign entries and comments, and counts removals', () => {
    const source = [
      'eventHooks:',
      '  events:',
      '    - name: on_session_start # keep me',
      '      commands:',
      '        - command: echo hi',
      '    - name: on_session_start',
      '      commands:',
      '        - command: run --ca',
      '',
    ].join('\n');
    const document = parseConfig(source);

    const result = removeHookEntries(document, isOwned);
    const out = String(document);

    expect(result).toEqual({ changed: true, removedCount: 1 });
    expect(out).toContain('on_session_start # keep me');
    expect(out).not.toContain('--ca');
  });

  it('prunes structure emptied by removal', () => {
    const document = parseConfig('otherKey: 1\n');
    ensureHookEntries(document, [buildOwnedEntry('on_session_start'), buildOwnedEntry('on_session_end')], isOwned);

    const result = removeHookEntries(document, isOwned);
    const out = String(document);

    expect(result).toEqual({ changed: true, removedCount: 2 });
    expect(out).not.toContain('eventHooks');
    expect(out).toContain('otherKey: 1');
  });

  it('keeps eventHooks when other keys remain after the events list empties', () => {
    const document = parseConfig('eventHooks:\n  logFile: "~/.rovodev/event_hooks.log"\n');
    ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned);

    const result = removeHookEntries(document, isOwned);
    const out = String(document);

    expect(result).toEqual({ changed: true, removedCount: 1 });
    expect(out).toContain('logFile:');
    expect(out).not.toContain('events:');
  });

  it('returns unchanged when no owned entries exist', () => {
    const document = parseConfig(VENDOR_SHAPED_CONFIG);
    expect(removeHookEntries(document, isOwned)).toEqual({ changed: false, removedCount: 0 });
  });
});

describe(RovoConfigParseError, () => {
  it('is thrown when operating on a document with parse errors, without mutating it', () => {
    const document = parseConfig('eventHooks: [unterminated\n');
    expect(document.errors.length).toBeGreaterThan(0);

    expect(() => ensureHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned)).toThrow(
      RovoConfigParseError,
    );
    expect(() => checkHookEntries(document, [buildOwnedEntry('on_session_start')], isOwned)).toThrow(
      RovoConfigParseError,
    );
    expect(() => removeHookEntries(document, isOwned)).toThrow(RovoConfigParseError);
  });
});
