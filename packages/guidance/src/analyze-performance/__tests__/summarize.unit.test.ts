import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collect } from '../collect.ts';
import { summarize } from '../summarize.ts';
import { buildFakeDependencies, type FakeHandlers } from '../test-utils/fake-dependencies.ts';
import { buildPsiResponse, buildReport } from '../test-utils/fixtures.ts';

describe('summarize', () => {
  let out: string;

  beforeEach(() => {
    out = mkdtempSync(path.join(tmpdir(), 'analyze-performance-summarize-'));
  });

  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it('takes the median of each lab metric across runs, keeps each run value, and classes the median', async () => {
    const lcpValues = [3_000, 5_000, 4_000];
    let run = 0;
    const summary = await collectAndSummarize(out, ['http://localhost/'], {
      lighthouse: () => buildReport({ lcp: lcpValues[run++ % 3] ?? 0 }),
    });

    const lcp = summary.pages[0]?.lab.mobile.metrics.lcp;
    expect(lcp).toEqual({ value: 4_000, values: [3_000, 5_000, 4_000], class: 'needs-improvement' });
  });

  it('labels lab TBT as a proxy for INP', async () => {
    const summary = await collectAndSummarize(out, ['http://localhost/'], {
      lighthouse: () => buildReport({ tbt: 700 }),
    });

    expect(summary.pages[0]?.lab.desktop.metrics.tbt).toMatchObject({ value: 700, class: 'poor', proxyFor: 'inp' });
  });

  it('marks a row with fewer than two successful runs, lists it as unmeasured, and does not merge its insights', async () => {
    let run = 0;
    const summary = await collectAndSummarize(out, ['http://localhost/'], {
      lighthouse: (_url, formFactor) => (formFactor === 'mobile' && run++ > 0 ? new Error('crashed') : buildReport()),
    });

    const page = summary.pages[0];
    expect(page?.lab.mobile).toMatchObject({ runsSucceeded: 1, insufficientRuns: true });
    expect(page?.lab.desktop.insufficientRuns).toBe(false);
    expect(summary.unmeasured).toContain('http://localhost/ (mobile): 1 of 3 lab runs succeeded, too few to rank on');
    expect(
      summary.insights.every((insight) => insight.occurrences.every(({ formFactor }) => formFactor === 'desktop')),
    ).toBe(true);
  });

  it('merges an insight that several pages report for one culprit into one entry', async () => {
    const summary = await collectAndSummarize(out, ['http://localhost/a', 'http://localhost/b'], {
      lighthouse: () => buildReport(),
    });

    const styles = summary.insights.filter(
      (insight) => insight.id === 'render-blocking-insight' && insight.culprit === 'https://example.com/styles.css',
    );
    expect(styles).toHaveLength(1);
    expect(styles[0]?.occurrences.map(({ slug }) => slug).toSorted()).toEqual([
      'localhost-a',
      'localhost-a',
      'localhost-b',
      'localhost-b',
    ]);
    expect(styles[0]?.savings).toEqual({ FCP: 900, LCP: 900 });
    expect(styles[0]?.files).toHaveLength(12);
  });

  it('orders insights by their largest millisecond saving', async () => {
    const summary = await collectAndSummarize(out, ['http://localhost/'], { lighthouse: () => buildReport() });

    expect(summary.insights[0]?.id).toBe('render-blocking-insight');
    expect(summary.insights.at(-1)?.id).toBe('lcp-breakdown-insight');
  });

  it('classes field data from PSI at URL and origin level', async () => {
    const summary = await collectAndSummarize(out, ['https://example.com/'], {
      psi: () => ({ status: 200, body: buildPsiResponse(buildReport(), { field: true }) }),
    });

    const field = summary.pages[0]?.field;
    expect(field?.source).toBe('psi');
    expect(field?.byFormFactor.mobile.url?.lcp).toEqual({ value: 3_100, class: 'needs-improvement' });
    expect(field?.byFormFactor.mobile.origin?.cls).toEqual({ value: 0.3, class: 'poor' });
    expect(summary.unmeasured).toEqual([]);
  });

  it('lists a page without field data as unmeasured, with the reason', async () => {
    const summary = await collectAndSummarize(out, ['http://localhost/'], { lighthouse: () => buildReport() });

    expect(summary.pages[0]?.field.byFormFactor.mobile).toEqual({ url: null, origin: null });
    expect(summary.unmeasured).toContain(
      'http://localhost/: field data unavailable: the URL is private, so CrUX has no data for it',
    );
  });
});

// region | Helpers

/** Collects the URLs into the test's output directory through fakes, then summarizes the directory. */
async function collectAndSummarize(
  out: string,
  urls: string[],
  handlers: FakeHandlers,
): Promise<ReturnType<typeof summarize>> {
  const { dependencies } = buildFakeDependencies(handlers);
  const manifest = await collect({ urls, privateUrls: new Set(), runs: 3, out, cwd: out }, dependencies);
  return summarize(manifest, out);
}

// endregion | Helpers
