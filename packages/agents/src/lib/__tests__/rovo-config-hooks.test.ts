import { describe, expect, it } from 'vitest';
import { type Document, isSeq, parseDocument } from 'yaml';

import {
  checkHookEntries,
  ensureHookEntries,
  type HookSentinelMatcher,
  type OwnedHookEntry,
  removeHookEntries,
  RovoConfigParseError,
} from '../rovo-config-hooks.ts';

/** A test sentinel: ownership is marked by a `--ca` token in any command. Encoding is the caller's choice. */
const isOwned: HookSentinelMatcher = (entry) => entry.commands.some((command) => command.includes('--ca'));

/** Builds an owned entry for `eventKey` carrying the sentinel token. */
function buildOwnedEntry(eventKey: string, name: string): OwnedHookEntry {
  return { eventKey, entry: { name, commands: [`run ${name} --ca`] } };
}

/** Parses YAML source into a document, preserving any parse errors for the parse-guard tests. */
function parseConfig(source: string): Document {
  return parseDocument(source);
}

/** The number of items in the named event array, or -1 when it is missing or malformed. */
function eventArrayLength(document: Document, eventKey: string): number {
  const array = document.getIn(['eventHooks', 'events', eventKey]);
  return isSeq(array) ? array.items.length : -1;
}

describe(ensureHookEntries, () => {
  it('creates eventHooks, events, and the array when the document is empty', () => {
    const document = parseConfig('');
    const result = ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned);

    expect(result.changed).toBe(true);
    expect(String(document)).toContain('eventHooks:');
    expect(checkHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned)[0]?.status).toBe('present');
  });

  it('is a no-op on an immediate re-run', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned);

    expect(ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned).changed).toBe(false);
  });

  it('replaces a drifted owned entry in place rather than duplicating it', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned);

    const drifted: OwnedHookEntry = {
      eventKey: 'sessionStart',
      entry: { name: 'a', commands: ['run a --ca --extra'] },
    };
    const result = ensureHookEntries(document, [drifted], isOwned);

    expect(result.changed).toBe(true);
    expect(eventArrayLength(document, 'sessionStart')).toBe(1);
    expect(String(document)).toContain('--extra');
  });

  it('installs two owned entries in the same event array, keeps a re-run a no-op, and drifts only one', () => {
    const document = parseConfig('');
    const both = [buildOwnedEntry('sessionStart', 'a'), buildOwnedEntry('sessionStart', 'b')];

    expect(ensureHookEntries(document, both, isOwned).changed).toBe(true);
    expect(eventArrayLength(document, 'sessionStart')).toBe(2);

    expect(ensureHookEntries(document, both, isOwned).changed).toBe(false);

    const drifted: OwnedHookEntry[] = [
      buildOwnedEntry('sessionStart', 'a'),
      { eventKey: 'sessionStart', entry: { name: 'b', commands: ['run b --ca --v2'] } },
    ];
    expect(ensureHookEntries(document, drifted, isOwned).changed).toBe(true);
    expect(eventArrayLength(document, 'sessionStart')).toBe(2);

    const statuses = checkHookEntries(document, drifted, isOwned).map((check) => check.status);
    expect(statuses).toEqual(['present', 'present']);
  });

  it('throws when a supplied entry does not satisfy the sentinel matcher', () => {
    const document = parseConfig('');
    const unsentineled: OwnedHookEntry = { eventKey: 'sessionStart', entry: { name: 'a', commands: ['run a'] } };

    expect(() => ensureHookEntries(document, [unsentineled], isOwned)).toThrow(/sentinel/);
    expect(String(document)).not.toContain('eventHooks');
  });

  it('leaves foreign entries, foreign comments, and unrelated keys untouched', () => {
    const source = [
      '# top comment',
      'otherKey: 42 # inline comment',
      'eventHooks:',
      '  events:',
      '    sessionStart:',
      '      - name: foreign # foreign inline',
      '        commands:',
      '          - echo hi',
      '',
    ].join('\n');
    const document = parseConfig(source);

    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'ca-hook')], isOwned);
    const out = String(document);

    expect(out).toContain('# top comment');
    expect(out).toContain('42 # inline comment');
    expect(out).toContain('name: foreign # foreign inline');
    expect(out).toContain('echo hi');
    expect(out).toContain('ca-hook');
  });

  it('matches and mutates owned entries scattered across event arrays, interleaved with foreign entries', () => {
    const source = [
      'eventHooks:',
      '  events:',
      '    sessionStart:',
      '      - name: foreign-a',
      '        commands: [echo a]',
      '      - name: ca-start',
      '        commands: [run start --ca]',
      '    sessionEnd:',
      '      - name: ca-end',
      '        commands: [run end --ca]',
      '      - name: foreign-b',
      '        commands: [echo b]',
      '',
    ].join('\n');
    const document = parseConfig(source);

    const drifted: OwnedHookEntry[] = [
      { eventKey: 'sessionStart', entry: { name: 'ca-start', commands: ['run start --ca --v2'] } },
      { eventKey: 'sessionEnd', entry: { name: 'ca-end', commands: ['run end --ca --v2'] } },
    ];
    const result = ensureHookEntries(document, drifted, isOwned);
    const out = String(document);

    expect(result.changed).toBe(true);
    expect(out).toContain('run start --ca --v2');
    expect(out).toContain('run end --ca --v2');
    expect(out).toContain('name: foreign-a');
    expect(out).toContain('name: foreign-b');
  });
});

describe(checkHookEntries, () => {
  it('reports present, drifted, and absent by name', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'present')], isOwned);

    const results = checkHookEntries(
      document,
      [
        buildOwnedEntry('sessionStart', 'present'),
        { eventKey: 'sessionStart', entry: { name: 'present', commands: ['run present --ca --changed'] } },
        buildOwnedEntry('sessionEnd', 'missing'),
      ],
      isOwned,
    );

    expect(results[0]?.status).toBe('present');
    expect(results[1]?.status).toBe('drifted');
    expect(results[2]?.status).toBe('absent');
  });

  it('reports drifted when the event holds owned entries but none matches the supplied name', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned);

    const result = checkHookEntries(document, [buildOwnedEntry('sessionStart', 'other')], isOwned);
    expect(result[0]?.status).toBe('drifted');
  });
});

describe(removeHookEntries, () => {
  it('deletes only owned entries, preserving foreign entries and comments, and counts removals', () => {
    const source = [
      'eventHooks:',
      '  events:',
      '    sessionStart:',
      '      - name: foreign # keep me',
      '        commands: [echo hi]',
      '      - name: ca-hook',
      '        commands: [run --ca]',
      '',
    ].join('\n');
    const document = parseConfig(source);

    const result = removeHookEntries(document, isOwned);
    const out = String(document);

    expect(result).toEqual({ changed: true, removedCount: 1 });
    expect(out).toContain('name: foreign # keep me');
    expect(out).not.toContain('--ca');
  });

  it('prunes structure emptied by removal', () => {
    const document = parseConfig('otherKey: 1\n');
    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a'), buildOwnedEntry('sessionEnd', 'b')], isOwned);

    const result = removeHookEntries(document, isOwned);
    const out = String(document);

    expect(result).toEqual({ changed: true, removedCount: 2 });
    expect(out).not.toContain('eventHooks');
    expect(out).toContain('otherKey: 1');
  });

  it('leaves partially-foreign structure intact', () => {
    const source = [
      'eventHooks:',
      '  events:',
      '    sessionStart:',
      '      - name: ca-hook',
      '        commands: [run --ca]',
      '    sessionEnd:',
      '      - name: foreign',
      '        commands: [echo hi]',
      '',
    ].join('\n');
    const document = parseConfig(source);

    removeHookEntries(document, isOwned);
    const out = String(document);

    expect(out).toContain('sessionEnd:');
    expect(out).toContain('name: foreign');
    expect(out).not.toContain('sessionStart:');
  });

  it('returns unchanged when no owned entries exist', () => {
    const document = parseConfig(
      'eventHooks:\n  events:\n    sessionStart:\n      - name: foreign\n        commands: [echo hi]\n',
    );
    expect(removeHookEntries(document, isOwned)).toEqual({ changed: false, removedCount: 0 });
  });
});

describe(RovoConfigParseError, () => {
  it('is thrown when operating on a document with parse errors, without mutating it', () => {
    const document = parseConfig('eventHooks: [unterminated\n');
    expect(document.errors.length).toBeGreaterThan(0);

    expect(() => ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned)).toThrow(
      RovoConfigParseError,
    );
    expect(() => checkHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned)).toThrow(
      RovoConfigParseError,
    );
    expect(() => removeHookEntries(document, isOwned)).toThrow(RovoConfigParseError);
  });
});
