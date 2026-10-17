import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { compareSites, normalizeSite, parseActiveSite, readSiteCheck } from '../check-site.ts';
import type { AcliResult } from '../create-work-item.ts';

const AUTHENTICATED = await readFixture('auth-status.authenticated.txt');
const UNAUTHENTICATED = await readFixture('auth-status.unauthenticated.txt');

describe(normalizeSite, () => {
  it.each([
    ['a ticket URL', 'https://Example.atlassian.net/browse/ABC-42'],
    ['a base URL with a trailing slash', 'https://example.atlassian.net/browse/'],
    ['a bare host', 'example.atlassian.net'],
    ['a host with a port', 'example.atlassian.net:443'],
  ])('returns the lowercase host of %s', (_label, target) => {
    expect(normalizeSite(target)).toBe('example.atlassian.net');
  });

  it('throws on a value that is not a URL or a host', () => {
    expect(() => normalizeSite('https://')).toThrow("not a URL or a host: 'https://'");
  });
});

describe(parseActiveSite, () => {
  it('reads the site from authenticated output', () => {
    expect(parseActiveSite(AUTHENTICATED)).toBe('example.atlassian.net');
  });

  it('returns null for unauthenticated output', () => {
    expect(parseActiveSite(UNAUTHENTICATED)).toBeNull();
  });

  it('returns null for output that it cannot parse', () => {
    expect(parseActiveSite('something else entirely\n')).toBeNull();
  });
});

describe(compareSites, () => {
  it('matches when the active site is the target host', () => {
    expect(compareSites(AUTHENTICATED, 'https://example.atlassian.net/browse/ABC-1')).toEqual({
      activeSite: 'example.atlassian.net',
      match: true,
      targetSite: 'example.atlassian.net',
    });
  });

  it('does not match when the active site is another host', () => {
    expect(compareSites(AUTHENTICATED, 'other.atlassian.net')).toMatchObject({
      activeSite: 'example.atlassian.net',
      match: false,
      targetSite: 'other.atlassian.net',
    });
  });

  it('does not tolerate a subdomain of the active site', () => {
    expect(compareSites(AUTHENTICATED, 'jira.example.atlassian.net').match).toBe(false);
  });
});

describe(readSiteCheck, () => {
  it('runs the status call and compares its site', async () => {
    const calls: Array<readonly string[]> = [];
    const check = await readSiteCheck('example.atlassian.net', (args) => {
      calls.push(args);
      return Promise.resolve(result(0, AUTHENTICATED));
    });

    expect(calls).toEqual([['jira', 'auth', 'status']]);
    expect(check.match).toBe(true);
  });

  it('reports a null active site when the status call fails', async () => {
    const check = await readSiteCheck('example.atlassian.net', () => Promise.resolve(result(1, '', UNAUTHENTICATED)));

    expect(check).toEqual({ activeSite: null, match: false, targetSite: 'example.atlassian.net' });
  });
});

// region | Helpers

/** Reads a recorded `acli jira auth status` output. */
async function readFixture(name: string): Promise<string> {
  return await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
}

/** Builds an `acli` result. */
function result(exitCode: number, stdout: string, stderr = ''): AcliResult {
  return { exitCode, stderr, stdout };
}

// endregion | Helpers
