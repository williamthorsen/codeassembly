import { describe, expect, it } from 'vitest';

import { isPrivateUrl, readFallbackReason, selectTool } from '../select-tool.ts';

describe('isPrivateUrl', () => {
  it.each([
    'http://localhost:3000/',
    'http://0.0.0.0:4173/',
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://172.20.0.1/',
    'http://192.168.1.10/',
    'http://169.254.0.5/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://app.local/',
    'http://api.internal/',
    'http://site.localhost/',
  ])('treats %s as private', (url) => {
    expect(isPrivateUrl(url, new Set())).toBe(true);
  });

  it.each(['https://example.com/', 'http://172.32.0.1/', 'http://8.8.8.8/'])('treats %s as public', (url) => {
    expect(isPrivateUrl(url, new Set())).toBe(false);
  });

  it('treats a URL that the caller marks private as private', () => {
    expect(isPrivateUrl('https://preview.example.com/', new Set(['https://preview.example.com/']))).toBe(true);
  });
});

describe('selectTool', () => {
  it('chooses PSI for a public URL and the Lighthouse CLI for a private one', () => {
    expect(selectTool('https://example.com/', new Set())).toBe('psi');
    expect(selectTool('http://localhost:8080/', new Set())).toBe('lighthouse');
  });
});

describe('readFallbackReason', () => {
  it.each([
    [{ kind: 'http', status: 429, message: 'Quota exceeded' }],
    [{ kind: 'http', status: 503, message: 'Backend error' }],
    [{ kind: 'http', status: 400, message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' }],
    [{ kind: 'network', message: 'fetch failed' }],
  ] as const)('falls back on %o', (failure) => {
    expect(readFallbackReason(failure)).toEqual(expect.any(String));
  });

  it('does not fall back on another client error', () => {
    expect(readFallbackReason({ kind: 'http', status: 400, message: 'Invalid value at url' })).toBeNull();
  });
});
