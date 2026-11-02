import { describe, expect, it } from 'vitest';

import { normalizeCulprit, readCruxField, readFailingInsights, readLabMetrics, readPsiField } from '../normalize.ts';
import { CruxRecordSchema, LighthouseReportSchema, PsiResponseSchema } from '../schemas.ts';
import { buildCruxRecord, buildPsiResponse, buildReport } from '../test-utils/fixtures.ts';

describe('readLabMetrics', () => {
  it('reads each metric audit numeric value', () => {
    expect(readLabMetrics(LighthouseReportSchema.parse(buildReport()))).toEqual({
      cls: 0.02,
      fcp: 3_100,
      lcp: 4_200,
      speedIndex: 4_800,
      tbt: 450,
    });
  });
});

describe('readFailingInsights', () => {
  const insights = readFailingInsights(LighthouseReportSchema.parse(buildReport()));

  it('lists insights scored below 0.9 or estimating a saving, and skips passing and not-applicable ones', () => {
    expect(insights.map((insight) => insight.id)).toEqual([
      'image-delivery-insight',
      'lcp-breakdown-insight',
      'render-blocking-insight',
    ]);
  });

  it('keeps only positive savings', () => {
    expect(insights.find((insight) => insight.id === 'image-delivery-insight')?.savings).toEqual({ LCP: 350 });
  });

  it('collects culprit URLs from nested details without their query strings and fragments', () => {
    expect(insights.find((insight) => insight.id === 'render-blocking-insight')?.culprits).toEqual([
      'https://example.com/app.js',
      'https://example.com/styles.css',
    ]);
    expect(insights.find((insight) => insight.id === 'image-delivery-insight')?.culprits).toEqual([
      'https://example.com/hero.jpg',
    ]);
    expect(insights.find((insight) => insight.id === 'lcp-breakdown-insight')?.culprits).toEqual([]);
  });
});

describe('normalizeCulprit', () => {
  it('strips the query string and fragment of a URL', () => {
    expect(normalizeCulprit('https://cdn.example.com/a.js?v=1#x')).toBe('https://cdn.example.com/a.js');
  });
});

describe('readPsiField', () => {
  const response = PsiResponseSchema.parse(buildPsiResponse(buildReport(), { field: true }));

  it('reads URL-level percentiles and divides CLS by 100', () => {
    expect(readPsiField(response.loadingExperience, 'url')).toEqual({ cls: 0.08, inp: 240, lcp: 3_100 });
  });

  it('reads origin-level percentiles', () => {
    expect(readPsiField(response.originLoadingExperience, 'origin')).toEqual({ cls: 0.3, inp: 150, lcp: 2_400 });
  });

  it('does not take origin data that PSI substituted for a URL as URL data', () => {
    expect(readPsiField({ ...response.loadingExperience, origin_fallback: true }, 'url')).toBeNull();
  });

  it('returns null when the response has no field data', () => {
    expect(readPsiField(undefined, 'url')).toBeNull();
  });
});

describe('readCruxField', () => {
  it('reads the p75 of each metric, parsing the string that the API gives for CLS', () => {
    const record = CruxRecordSchema.parse(buildCruxRecord());
    expect(readCruxField({ url: record, origin: null })).toEqual({
      url: { cls: 0.12, inp: 180, lcp: 2_900 },
      origin: null,
    });
  });
});
