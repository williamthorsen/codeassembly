import { describe, expect, it } from 'vitest';

import { type FlagSpec, scanFlags } from '../parse-flags.ts';

const SPECS: readonly FlagSpec[] = [
  { name: 'store', aliases: ['kb'], takesValue: true },
  { name: 'tag', takesValue: true },
  { name: 'all-kbs', takesValue: false },
];

describe(scanFlags, () => {
  it('collects bare tokens as positionals in order', () => {
    expect(scanFlags(['alpha', 'beta'], SPECS)).toEqual({ positionals: ['alpha', 'beta'], flags: [] });
  });

  it('reports a boolean flag with a null value', () => {
    expect(scanFlags(['--all-kbs'], SPECS)).toEqual({ positionals: [], flags: [{ name: 'all-kbs', value: null }] });
  });

  it('resolves a value-bearing flag from the inline =value form', () => {
    expect(scanFlags(['--store=coding'], SPECS).flags).toEqual([{ name: 'store', value: 'coding' }]);
  });

  it('resolves a value-bearing flag from the next token', () => {
    expect(scanFlags(['--store', 'coding'], SPECS).flags).toEqual([{ name: 'store', value: 'coding' }]);
  });

  it('binds an inline =value verbatim even when it begins with --', () => {
    expect(scanFlags(['--tag=--weird'], SPECS).flags).toEqual([{ name: 'tag', value: '--weird' }]);
  });

  it('binds an empty inline =value, leaving emptiness for the command to judge', () => {
    expect(scanFlags(['--tag='], SPECS).flags).toEqual([{ name: 'tag', value: '' }]);
  });

  it('rejects a value-bearing flag whose value is absent at the end of argv', () => {
    expect(() => scanFlags(['--store'], SPECS)).toThrow('--store requires a value');
  });

  it('rejects a next-token value that is itself a flag', () => {
    expect(() => scanFlags(['--store', '--tag'], SPECS)).toThrow('--store requires a value');
  });

  it('reports a flag under its canonical name when an alias spelling is used', () => {
    expect(scanFlags(['--kb', 'coding'], SPECS).flags).toEqual([{ name: 'store', value: 'coding' }]);
  });

  it('throws on an unknown flag', () => {
    expect(() => scanFlags(['--nope'], SPECS)).toThrow('unknown flag: --nope');
  });

  it('throws when a boolean flag is given an inline value', () => {
    expect(() => scanFlags(['--all-kbs=1'], SPECS)).toThrow('--all-kbs does not take a value');
  });

  it('preserves positionals and flags interleaved, with flags in encounter order', () => {
    const result = scanFlags(['query', '--tag', 'fix', '--store=coding', 'more'], SPECS);
    expect(result).toEqual({
      positionals: ['query', 'more'],
      flags: [
        { name: 'tag', value: 'fix' },
        { name: 'store', value: 'coding' },
      ],
    });
  });

  it('records a repeated flag once per occurrence so a command can detect duplicates', () => {
    expect(scanFlags(['--tag', 'a', '--tag', 'b'], SPECS).flags).toEqual([
      { name: 'tag', value: 'a' },
      { name: 'tag', value: 'b' },
    ]);
  });
});
