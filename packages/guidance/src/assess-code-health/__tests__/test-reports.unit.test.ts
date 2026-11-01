import { describe, expect, it } from 'vitest';

import { MAX_TIMING_ROWS, parseCoverageSummary, parseJunit } from '../test-reports.ts';

describe('parseCoverageSummary', () => {
  it('returns the unit files relative to the root, least covered first', () => {
    const summary = {
      total: buildMetrics(80),
      '/repo/pkg/src/a.ts': buildMetrics(90),
      '/repo/pkg/src/b.ts': buildMetrics(40),
      '/repo/other/c.ts': buildMetrics(10),
    };

    expect(parseCoverageSummary(summary, '/repo', 'pkg')).toEqual([
      { path: 'pkg/src/b.ts', lines: 40, branches: 40, functions: 40 },
      { path: 'pkg/src/a.ts', lines: 90, branches: 90, functions: 90 },
    ]);
  });

  it('throws on a document without the summary shape', () => {
    expect(() => parseCoverageSummary({ '/repo/a.ts': { lines: 1 } }, '/repo', '.')).toThrow();
  });
});

describe('parseJunit', () => {
  it('reads each case with its suite as the file, slowest first, decoding entities', () => {
    const xml = [
      '<testsuites>',
      '<testsuite name="src/a.test.ts" tests="2">',
      '<testcase classname="src/a.test.ts" name="fast &amp; small" time="0.001"/>',
      '<testcase classname="src/a.test.ts" name="slow" time="1.5"></testcase>',
      '</testsuite>',
      '<testsuite name="src/b.test.ts"><testcase name="mid" time="0.2" file="src/b.test.ts"/></testsuite>',
      '</testsuites>',
    ].join('\n');

    expect(parseJunit(xml)).toEqual([
      { file: 'src/a.test.ts', name: 'slow', durationMs: 1_500 },
      { file: 'src/b.test.ts', name: 'mid', durationMs: 200 },
      { file: 'src/a.test.ts', name: 'fast & small', durationMs: 1 },
    ]);
  });

  it('keeps only the slowest cases', () => {
    const cases = Array.from(
      { length: MAX_TIMING_ROWS + 5 },
      (_, index) => `<testcase name="t${index}" time="${index}"/>`,
    );

    const rows = parseJunit(`<testsuite name="s">${cases.join('')}</testsuite>`);

    expect(rows).toHaveLength(MAX_TIMING_ROWS);
    expect(rows[0]?.name).toBe(`t${MAX_TIMING_ROWS + 4}`);
  });
});

// region | Helpers

/** Builds a file's summary metrics, all at one percentage. */
function buildMetrics(pct: number): Record<string, { pct: number }> {
  return { lines: { pct }, statements: { pct }, branches: { pct }, functions: { pct } };
}

// endregion | Helpers
