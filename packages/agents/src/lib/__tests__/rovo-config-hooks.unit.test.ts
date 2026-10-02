import { describe, expect, it } from 'vitest';
import { type Document, parseDocument } from 'yaml';

import { HARNESSES } from '../harness.ts';
import { type HookSentinelMatcher, removeHookEntries, RovoConfigParseError } from '../rovo-config-hooks.ts';

const ROVO_LOG_FILE_SETTING = `logFile: "~/${HARNESSES.rovo.homeDir}/event_hooks.log"`;

/** A test sentinel: Ownership is marked by a `--ca` token in any command. Encoding is the caller's choice. */
const isOwned: HookSentinelMatcher = (entry) => entry.commands.some((command) => command.includes('--ca'));

/** The shape that the vendor documents and real configs use: a list of `{name, commands: [{command}]}` items. */
const VENDOR_SHAPED_CONFIG = [
  'eventHooks:',
  `  ${ROVO_LOG_FILE_SETTING}`,
  '  events:',
  '    - name: on_complete',
  '      commands:',
  "        - command: echo 'Agent run finished'",
  '    - name: on_session_end',
  '      commands:',
  "        - command: echo 'Session ended'",
  '',
].join('\n');

/** Parses YAML source into a document, preserving any parse errors for the parse-guard tests. */
function parseConfig(source: string): Document {
  return parseDocument(source);
}

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

  it('deletes owned entries interleaved with foreign entries across events', () => {
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
      '          timeout: 5',
      '    - name: on_session_end',
      '      commands:',
      '        - command: echo b',
      '',
    ].join('\n');
    const document = parseConfig(source);

    const result = removeHookEntries(document, isOwned);

    expect(result).toEqual({ changed: true, removedCount: 2 });
    expect(String(document)).toBe(
      [
        'eventHooks:',
        '  events:',
        '    - name: on_session_start',
        '      commands:',
        '        - command: echo a',
        '    - name: on_session_end',
        '      commands:',
        '        - command: echo b',
        '',
      ].join('\n'),
    );
  });

  it('prunes structure emptied by removal', () => {
    const source = [
      'otherKey: 1',
      'eventHooks:',
      '  events:',
      '    - name: on_session_start',
      '      commands:',
      '        - command: run on_session_start --ca',
      '    - name: on_session_end',
      '      commands:',
      '        - command: run on_session_end --ca',
      '',
    ].join('\n');
    const document = parseConfig(source);

    const result = removeHookEntries(document, isOwned);
    const out = String(document);

    expect(result).toEqual({ changed: true, removedCount: 2 });
    expect(out).not.toContain('eventHooks');
    expect(out).toContain('otherKey: 1');
  });

  it('keeps eventHooks when other keys remain after the events list empties', () => {
    const source = [
      'eventHooks:',
      `  ${ROVO_LOG_FILE_SETTING}`,
      '  events:',
      '    - name: on_session_start',
      '      commands:',
      '        - command: run on_session_start --ca',
      '',
    ].join('\n');
    const document = parseConfig(source);

    const result = removeHookEntries(document, isOwned);
    const out = String(document);

    expect(result).toEqual({ changed: true, removedCount: 1 });
    expect(out).toContain('logFile:');
    expect(out).not.toContain('events:');
  });

  it('returns unchanged when the document does not contain any owned entries', () => {
    const document = parseConfig(VENDOR_SHAPED_CONFIG);
    expect(removeHookEntries(document, isOwned)).toEqual({ changed: false, removedCount: 0 });
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

    expect(() => removeHookEntries(document, isOwned)).toThrow(/list/);
  });
});

describe(RovoConfigParseError, () => {
  it('is thrown when removing from a document with parse errors', () => {
    const document = parseConfig('eventHooks: [unterminated\n');
    expect(document.errors.length).toBeGreaterThan(0);

    expect(() => removeHookEntries(document, isOwned)).toThrow(RovoConfigParseError);
  });
});
