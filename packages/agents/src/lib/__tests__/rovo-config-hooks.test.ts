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

describe(checkHookEntries, () => {
  it('reports present, drifted, and absent', () => {
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
});

describe(ensureHookEntries, () => {
  it('creates eventHooks, events, and the array when the document is empty', () => {
    const document = parseConfig('');
    const changed = ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned);

    expect(changed).toBe(true);
    expect(String(document)).toContain('eventHooks:');
    expect(checkHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned)[0]?.status).toBe('present');
  });

  it('is a no-op on an immediate re-run', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned);

    expect(ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned)).toBe(false);
  });

  it('replaces a drifted owned entry in place rather than duplicating it', () => {
    const document = parseConfig('');
    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a')], isOwned);

    const drifted: OwnedHookEntry = {
      eventKey: 'sessionStart',
      entry: { name: 'a', commands: ['run a --ca --extra'] },
    };
    const changed = ensureHookEntries(document, [drifted], isOwned);

    expect(changed).toBe(true);
    const array = document.getIn(['eventHooks', 'events', 'sessionStart']);
    expect(isSeq(array) ? array.items.length : -1).toBe(1);
    expect(String(document)).toContain('--extra');
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
    const changed = ensureHookEntries(document, drifted, isOwned);
    const out = String(document);

    expect(changed).toBe(true);
    expect(out).toContain('run start --ca --v2');
    expect(out).toContain('run end --ca --v2');
    expect(out).toContain('name: foreign-a');
    expect(out).toContain('name: foreign-b');
  });
});

describe(removeHookEntries, () => {
  it('deletes only owned entries, preserving foreign entries and comments', () => {
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

    const changed = removeHookEntries(document, isOwned);
    const out = String(document);

    expect(changed).toBe(true);
    expect(out).toContain('name: foreign # keep me');
    expect(out).not.toContain('--ca');
  });

  it('prunes structure emptied by removal', () => {
    const document = parseConfig('otherKey: 1\n');
    ensureHookEntries(document, [buildOwnedEntry('sessionStart', 'a'), buildOwnedEntry('sessionEnd', 'b')], isOwned);

    removeHookEntries(document, isOwned);
    const out = String(document);

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

  it('returns false when no owned entries exist', () => {
    const document = parseConfig(
      'eventHooks:\n  events:\n    sessionStart:\n      - name: foreign\n        commands: [echo hi]\n',
    );
    expect(removeHookEntries(document, isOwned)).toBe(false);
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

// region | Helpers

/** Parses YAML source into a document, preserving any parse errors for the parse-guard tests. */
function parseConfig(source: string): Document {
  return parseDocument(source);
}

/** A test sentinel: ownership is marked by a `--ca` token in any command. Encoding is the caller's choice. */
const isOwned: HookSentinelMatcher = (entry) => entry.commands.some((command) => command.includes('--ca'));

/** Builds an owned entry for `eventKey` carrying the sentinel token. */
function buildOwnedEntry(eventKey: string, name: string): OwnedHookEntry {
  return { eventKey, entry: { name, commands: [`run ${name} --ca`] } };
}

// endregion | Helpers
