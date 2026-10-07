import { describe, expect, it } from 'vitest';

import { parseArgs } from '../cli.ts';

describe(parseArgs, () => {
  it('returns null fields and an empty mutation list for an empty argv', () => {
    expect(parseArgs([])).toEqual({ branch: null, cwd: null, home: null, mutations: [] });
  });

  it('parses --branch, --cwd, and --home as separate-token flags', () => {
    expect(parseArgs(['--branch', 'main', '--cwd', '/tmp/foo', '--home', '/tmp/home'])).toEqual({
      branch: 'main',
      cwd: '/tmp/foo',
      home: '/tmp/home',
      mutations: [],
    });
  });

  it('parses --branch=value inline form', () => {
    expect(parseArgs(['--branch=main'])).toEqual({ branch: 'main', cwd: null, home: null, mutations: [] });
  });

  it('parses --home=value inline form', () => {
    expect(parseArgs(['--home=/tmp/x'])).toEqual({ branch: null, cwd: null, home: '/tmp/x', mutations: [] });
  });

  it('parses --cwd=value inline form', () => {
    expect(parseArgs(['--cwd=/tmp/foo'])).toEqual({ branch: null, cwd: '/tmp/foo', home: null, mutations: [] });
  });

  it('parses --set-ticket-url and --set-pr-url as set mutations', () => {
    expect(parseArgs(['--set-ticket-url', 'https://x/issues/1', '--set-pr-url', 'https://x/pull/2']).mutations).toEqual(
      [
        { field: 'ticket_url', value: 'https://x/issues/1' },
        { field: 'pr_url', value: 'https://x/pull/2' },
      ],
    );
  });

  it('parses --set-ticket-url=value inline form', () => {
    expect(parseArgs(['--set-ticket-url=https://x/issues/1']).mutations).toEqual([
      { field: 'ticket_url', value: 'https://x/issues/1' },
    ]);
  });

  it('parses --set-pr-url=value inline form', () => {
    expect(parseArgs(['--set-pr-url=https://x/pull/2']).mutations).toEqual([
      { field: 'pr_url', value: 'https://x/pull/2' },
    ]);
  });

  it('parses --clear-ticket-url and --clear-pr-url as null mutations', () => {
    expect(parseArgs(['--clear-ticket-url', '--clear-pr-url']).mutations).toEqual([
      { field: 'ticket_url', value: null },
      { field: 'pr_url', value: null },
    ]);
  });

  it('throws when --branch is missing its value', () => {
    expect(() => parseArgs(['--branch'])).toThrow(/--branch requires a value/);
  });

  it('throws when --home is missing its value', () => {
    expect(() => parseArgs(['--home'])).toThrow(/--home requires a value/);
  });

  it('throws when --set-ticket-url is missing its value', () => {
    expect(() => parseArgs(['--set-ticket-url'])).toThrow(/--set-ticket-url requires a value/);
  });

  it('throws when --set-pr-url is missing its value', () => {
    expect(() => parseArgs(['--set-pr-url'])).toThrow(/--set-pr-url requires a value/);
  });

  it('throws on unknown arguments', () => {
    expect(() => parseArgs(['--mystery'])).toThrow(/unknown argument/);
  });
});
