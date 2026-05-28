import { describe, expect, it } from 'vitest';

import { parseArgs } from '../cli.ts';

describe(parseArgs, () => {
  it('parses --bump-updated with a positional path', () => {
    const parsed = parseArgs(['notes/foo.md', '--bump-updated']);

    expect(parsed).toEqual({ operation: 'bump-updated', path: 'notes/foo.md' });
  });

  it('parses --verify with a positional path', () => {
    const parsed = parseArgs(['/abs/path/foo.md', '--verify']);

    expect(parsed).toEqual({ operation: 'verify', path: '/abs/path/foo.md' });
  });

  it('parses --append with a positional path', () => {
    const parsed = parseArgs(['foo.md', '--append']);

    expect(parsed).toEqual({ operation: 'append', path: 'foo.md' });
  });

  it('parses --retag with a comma-separated list, trimming whitespace and dropping empties', () => {
    const parsed = parseArgs(['foo.md', '--retag', 'one, two ,three,,']);

    expect(parsed).toEqual({ operation: 'retag', path: 'foo.md', tags: ['one', 'two', 'three'] });
  });

  it('parses --retag with an inline = value', () => {
    const parsed = parseArgs(['foo.md', '--retag=a,b']);

    expect(parsed).toEqual({ operation: 'retag', path: 'foo.md', tags: ['a', 'b'] });
  });

  it('parses --supersede-with as a single value', () => {
    const parsed = parseArgs(['old.md', '--supersede-with', 'new.md']);

    expect(parsed).toEqual({ operation: 'supersede-with', path: 'old.md', newPath: 'new.md' });
  });

  it('parses --supersede-with with an inline = value', () => {
    const parsed = parseArgs(['old.md', '--supersede-with=new.md']);

    expect(parsed).toEqual({ operation: 'supersede-with', path: 'old.md', newPath: 'new.md' });
  });

  it('accepts the operation flag before the positional path', () => {
    const parsed = parseArgs(['--bump-updated', 'foo.md']);

    expect(parsed).toEqual({ operation: 'bump-updated', path: 'foo.md' });
  });

  it('throws when no operation flag is supplied', () => {
    expect(() => parseArgs(['foo.md'])).toThrow(/one operation flag is required/);
  });

  it('throws when two operation flags are combined', () => {
    expect(() => parseArgs(['foo.md', '--bump-updated', '--verify'])).toThrow(/mutually exclusive/);
  });

  it('throws when --retag and --supersede-with are combined', () => {
    expect(() => parseArgs(['foo.md', '--retag', 'a', '--supersede-with', 'new.md'])).toThrow(/mutually exclusive/);
  });

  it('throws when the positional path is missing', () => {
    expect(() => parseArgs(['--bump-updated'])).toThrow(/missing required <path>/);
  });

  it('throws when an extra positional argument is supplied', () => {
    expect(() => parseArgs(['foo.md', 'bar.md', '--bump-updated'])).toThrow(/unexpected extra positional/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['foo.md', '--bogus'])).toThrow(/unknown flag/);
  });

  it('throws when --retag has no value', () => {
    expect(() => parseArgs(['foo.md', '--retag'])).toThrow(/--retag requires a value/);
  });

  it('throws when --retag is followed by another flag instead of a value', () => {
    expect(() => parseArgs(['foo.md', '--retag', '--bump-updated'])).toThrow(/--retag requires a value/);
  });

  it('throws when --supersede-with has no value', () => {
    expect(() => parseArgs(['foo.md', '--supersede-with'])).toThrow(/--supersede-with requires a value/);
  });
});
