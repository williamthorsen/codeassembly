import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Returns an invocation that summarizes a run directory of one private page measured twice in each form factor by the
 * Lighthouse CLI, and asserts the median mobile LCP. `summarize` reads only local files, so the run stays offline.
 */
export function makeAnalyzePerformanceSmokeTest(): SmokeTestInvocation {
  const dir = mkdtempSync(path.join(tmpdir(), 'analyze-performance-'));
  const slug = 'localhost';
  mkdirSync(path.join(dir, slug));
  const runs = [];
  for (const formFactor of ['mobile', 'desktop']) {
    for (const [offset, lcp] of [2_000, 3_000].entries()) {
      const file = path.join(slug, `${formFactor}-${offset + 1}.lighthouse.json`);
      writeFileSync(path.join(dir, file), JSON.stringify(buildReport(lcp)), 'utf8');
      runs.push({ formFactor, index: offset + 1, file, error: null });
    }
  }
  const manifest = {
    version: 1,
    createdAt: '2026-11-01T12:00:00.000Z',
    lighthouseVersion: '13.6.0',
    runsPerFormFactor: 2,
    pages: [
      {
        url: 'http://localhost/',
        slug,
        private: true,
        tool: 'lighthouse',
        fallbackReason: null,
        fieldSource: null,
        fieldUnavailableReason: 'the URL is private, so CrUX has no data for it',
        crux: { mobile: null, desktop: null },
        psiField: { mobile: null, desktop: null },
        runs,
      },
    ],
  };
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  return { args: ['summarize', '--in', dir], cwd: dir, assertResult: assertMedianLcp };
}

// region | Helpers

/** Asserts that the summary reports the median of the two mobile LCP runs. */
function assertMedianLcp(result: unknown): void {
  if (!isRecord(result) || result['ok'] !== true || !Array.isArray(result['pages'])) {
    throw new TypeError(`expected an ok summary with pages, got ${JSON.stringify(result)}`);
  }
  const page: unknown = result['pages'][0];
  const lab = isRecord(page) ? page['lab'] : undefined;
  const mobile = isRecord(lab) ? lab['mobile'] : undefined;
  const metrics = isRecord(mobile) ? mobile['metrics'] : undefined;
  const lcp = isRecord(metrics) ? metrics['lcp'] : undefined;
  if (!isRecord(lcp) || lcp['value'] !== 2_500) {
    throw new Error(`expected a median mobile LCP of 2500, got ${JSON.stringify(lcp)}`);
  }
}

/** Builds the smallest Lighthouse report from which `summarize` reads an LCP value. */
function buildReport(lcp: number): Record<string, unknown> {
  return {
    lighthouseVersion: '13.6.0',
    audits: {
      'largest-contentful-paint': { id: 'largest-contentful-paint', scoreDisplayMode: 'numeric', numericValue: lcp },
    },
  };
}

// endregion | Helpers
