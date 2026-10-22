import { describe, expect, it } from 'vitest';

import { parseArgs } from '../parse-args.ts';

describe(parseArgs, () => {
  it('parses a command and its flags', () => {
    expect(parseArgs(['record-index', '--set-dir', '/s', '--url=https://x.test/a'])).toEqual({
      command: 'record-index',
      values: { 'set-dir': '/s', url: 'https://x.test/a' },
      notes: [],
    });
  });

  it('parses copy-probe without flags', () => {
    expect(parseArgs(['copy-probe'])).toEqual({ command: 'copy-probe', values: {}, notes: [] });
  });

  it('refuses --set-dir on copy-probe', () => {
    expect(() => parseArgs(['copy-probe', '--set-dir', '/s'])).toThrow(/copy-probe does not take --set-dir/);
  });

  it('refuses a missing command', () => {
    expect(() => parseArgs(['--set-dir', '/s'])).toThrow(/a command is required/);
  });

  it('refuses an unknown command', () => {
    expect(() => parseArgs(['publish'])).toThrow(/unknown command "publish"/);
  });

  it('refuses a flag that the command does not take', () => {
    expect(() => parseArgs(['record-index', '--set-dir', '/s', '--url', 'u', '--slug', 'a'])).toThrow(
      /record-index does not take --slug/,
    );
  });

  it('refuses a missing required flag', () => {
    expect(() => parseArgs(['record-index', '--set-dir', '/s'])).toThrow(/requires --url/);
  });

  it('refuses an empty value', () => {
    expect(() => parseArgs(['record-index', '--set-dir=', '--url', 'u'])).toThrow(/--set-dir requires a value/);
  });

  it('collects every --note in order, split at the first colon', () => {
    const argv = ['register', '--set-dir', '/s', '--slug', 'a', '--title', 'T', '--url', 'https://x.test/a'];

    const parsed = parseArgs([...argv, '--note', ' Search : Top bar ', '--note=Opens at: 10:30']);

    expect(parsed.notes).toEqual([
      { label: 'Search', value: 'Top bar' },
      { label: 'Opens at', value: '10:30' },
    ]);
    expect(parsed.values).not.toHaveProperty('note');
  });

  it.each(['Search', ': Top bar', 'Search:', 'Search:  '])('refuses the note %j', (note) => {
    const argv = ['register', '--set-dir', '/s', '--slug', 'a', '--title', 'T', '--url', 'https://x.test/a'];

    expect(() => parseArgs([...argv, '--note', note])).toThrow(/must have the form "<label>: <value>"/);
  });

  it('refuses --note on a command that does not take it', () => {
    expect(() => parseArgs(['render', '--set-dir', '/s', '--out', 'o', '--note', 'a: b'])).toThrow(
      /render does not take --note/,
    );
  });
});
