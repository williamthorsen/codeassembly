import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collect } from '../collect.ts';
import { buildFakeDependencies } from '../test-utils/fake-dependencies.ts';
import { buildCruxRecord, buildPsiResponse, buildReport } from '../test-utils/fixtures.ts';

describe('collect', () => {
  let out: string;

  beforeEach(() => {
    out = mkdtempSync(path.join(tmpdir(), 'analyze-performance-collect-'));
  });

  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it('measures a public URL with PSI in both form factors and takes its field data from PSI', async () => {
    const { dependencies, calls } = buildFakeDependencies({
      psi: () => ({ status: 200, body: buildPsiResponse(buildReport(), { field: true }) }),
    });

    const manifest = await collect(options(out, ['https://example.com/']), dependencies);

    const [page] = manifest.pages;
    expect(calls.psi.map(({ strategy }) => strategy)).toEqual([
      'mobile',
      'mobile',
      'mobile',
      'desktop',
      'desktop',
      'desktop',
    ]);
    expect(page).toMatchObject({ slug: 'example-com', tool: 'psi', fallbackReason: null, fieldSource: 'psi' });
    expect(
      page?.runs.every((run) => run.error === null && run.file !== null && existsSync(path.join(out, run.file))),
    ).toBe(true);
    expect(JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'))).toEqual(manifest);
  });

  it('switches the whole page to the Lighthouse CLI when PSI refuses for quota', async () => {
    const { dependencies, calls } = buildFakeDependencies({
      psi: () => ({ status: 429, body: { error: { code: 429, message: 'Quota exceeded' } } }),
      lighthouse: () => buildReport(),
    });

    const [page] = (await collect(options(out, ['https://example.com/']), dependencies)).pages;

    expect(calls.psi).toHaveLength(1);
    expect(calls.lighthouse).toHaveLength(6);
    expect(page).toMatchObject({
      tool: 'lighthouse',
      fallbackReason: 'PSI quota exhausted (HTTP 429)',
      fieldSource: null,
    });
    expect(page?.fieldUnavailableReason).toContain('CRUX_API_KEY');
    expect(page?.runs.every((run) => run.file?.endsWith('.lighthouse.json'))).toBe(true);
  });

  it('keeps the field data of the PSI runs that preceded a fallback', async () => {
    let call = 0;
    const { dependencies } = buildFakeDependencies({
      psi: () =>
        call++ < 3
          ? { status: 200, body: buildPsiResponse(buildReport(), { field: true }) }
          : { status: 429, body: { error: { code: 429, message: 'Quota exceeded' } } },
      lighthouse: () => buildReport(),
    });

    const [page] = (await collect(options(out, ['https://example.com/']), dependencies)).pages;

    expect(page).toMatchObject({
      tool: 'lighthouse',
      fieldSource: 'psi',
      psiField: { mobile: path.join('example-com', 'mobile-1.psi.json'), desktop: null },
      fieldUnavailableReason: 'PSI did not measure the desktop form factor and CRUX_API_KEY is not set',
    });
    expect(page?.runs.every((run) => run.file?.endsWith('.lighthouse.json'))).toBe(true);
  });

  it('records a PSI failure that does not fall back on its run and keeps measuring with PSI', async () => {
    const { dependencies, calls } = buildFakeDependencies({
      psi: () => ({ status: 400, body: { error: { code: 400, message: 'Invalid value at url' } } }),
    });

    const [page] = (await collect(options(out, ['https://example.com/']), dependencies)).pages;

    expect(calls.psi).toHaveLength(6);
    expect(page?.tool).toBe('psi');
    expect(page?.runs.every((run) => run.error === 'PSI failed: Invalid value at url')).toBe(true);
  });

  it('measures a private URL with the Lighthouse CLI alone and reports why field data is unavailable', async () => {
    const { dependencies, calls } = buildFakeDependencies({ lighthouse: () => buildReport() });

    const [page] = (await collect(options(out, ['http://localhost:4173/']), dependencies)).pages;

    expect(calls.psi).toHaveLength(0);
    expect(calls.lighthouse.filter(({ formFactor }) => formFactor === 'desktop')).toHaveLength(3);
    expect(page).toMatchObject({ private: true, tool: 'lighthouse', fallbackReason: null, fieldSource: null });
    expect(page?.fieldUnavailableReason).toContain('private');
  });

  it('takes field data from the CrUX API when a key is set, recording a 404 as a missing record', async () => {
    const { dependencies, calls } = buildFakeDependencies({
      cruxKey: 'test-key',
      psi: () => ({ status: 200, body: buildPsiResponse(buildReport(), { field: false }) }),
      crux: (query) => ('url' in query ? { status: 404, body: {} } : { status: 200, body: buildCruxRecord() }),
    });

    const [page] = (await collect(options(out, ['https://example.com/blog']), dependencies)).pages;

    expect(calls.crux).toEqual([
      { url: 'https://example.com/blog', formFactor: 'PHONE' },
      { origin: 'https://example.com', formFactor: 'PHONE' },
      { url: 'https://example.com/blog', formFactor: 'DESKTOP' },
      { origin: 'https://example.com', formFactor: 'DESKTOP' },
    ]);
    expect(page?.fieldSource).toBe('crux-api');
    const file = page?.crux.mobile;
    expect(file).toBe(path.join('example-com-blog', 'crux-mobile.json'));
    expect(JSON.parse(readFileSync(path.join(out, file ?? ''), 'utf8'))).toMatchObject({
      url: null,
      origin: { record: {} },
    });
  });

  it('keeps measuring the next URL after one whose every run failed', async () => {
    const { dependencies } = buildFakeDependencies({
      lighthouse: (url) => (url.includes('broken') ? new Error('Chrome did not start') : buildReport()),
    });

    const manifest = await collect(options(out, ['http://localhost/broken', 'http://localhost/ok']), dependencies);

    expect(manifest.pages.map((page) => page.runs.filter((run) => run.error === null).length)).toEqual([0, 6]);
    expect(manifest.pages[0]?.runs[0]?.error).toContain('Chrome did not start');
  });

  it('records a Lighthouse runtime error as a failed run', async () => {
    const { dependencies } = buildFakeDependencies({
      lighthouse: () => buildReport({}, { code: 'NO_FCP' }),
    });

    const [page] = (await collect(options(out, ['http://localhost/']), dependencies)).pages;

    expect(page?.runs[0]?.error).toBe('Lighthouse runtime error: NO_FCP');
  });

  it('gives each URL a distinct slug', async () => {
    const { dependencies } = buildFakeDependencies({ lighthouse: () => buildReport() });

    const manifest = await collect(options(out, ['http://localhost/a-b', 'http://localhost/a/b']), dependencies);

    expect(manifest.pages.map((page) => page.slug)).toEqual(['localhost-a-b', 'localhost-a-b-2']);
  });
});

// region | Helpers

/** Builds collect options for the URLs, writing to the test's output directory. */
function options(out: string, urls: string[]): Parameters<typeof collect>[0] {
  return { urls, privateUrls: new Set(), runs: 3, out, cwd: out };
}

// endregion | Helpers
