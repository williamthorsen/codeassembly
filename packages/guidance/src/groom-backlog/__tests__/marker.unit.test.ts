import { describe, expect, it } from 'vitest';

import { findLatestMarker, findLatestRunMarkerDate, parseMarkers, renderMarker } from '../marker.ts';

// The shape of a marker posted by the calibration sweep, which does not have `rule` or `remainder`.
const CALIBRATION_MARKER =
  '<!-- codeassembly-triage {"run":"2026-09-30-calibration","assessedAt":"2026-10-01T00:26:11Z","sha":"3538c0ad","verdicts":{"drift":"none","relevance":"uncertain","progress":"partial","advisability":"questionable","complexity":"involved"},"recommendation":"escalate","confidence":"medium","decision":"close-superseded","actor":"agent","decidedBy":"user"} -->';

describe(parseMarkers, () => {
  it('reads a calibration marker that does not have rule or remainder', () => {
    const [marker] = parseMarkers(`## Assessment\n\n**Disposition:** Closed.\n\n${CALIBRATION_MARKER}`);

    expect(marker).toMatchObject({ run: '2026-09-30-calibration', decision: 'close-superseded', decidedBy: 'user' });
  });

  it('skips a marker that is not JSON', () => {
    expect(parseMarkers('<!-- codeassembly-triage {not json} -->')).toStrictEqual([]);
  });
});

describe(renderMarker, () => {
  it('escapes > so that free text cannot close the comment, and round-trips', () => {
    const rendered = renderMarker({ run: 'r', remainder: ['a --> b'] });

    expect(rendered.slice(4, -4)).not.toContain('>');
    expect(parseMarkers(rendered)).toStrictEqual([{ run: 'r', remainder: ['a --> b'] }]);
  });
});

describe(findLatestMarker, () => {
  it('returns the marker of the latest comment that has one', () => {
    const comments = [
      { author: 'a', body: renderMarker({ run: 'old' }), createdAt: '2026-01-01T00:00:00Z' },
      { author: 'a', body: renderMarker({ run: 'new' }), createdAt: '2026-03-01T00:00:00Z' },
      { author: 'b', body: 'No marker', createdAt: '2026-04-01T00:00:00Z' },
    ];

    expect(findLatestMarker(comments)?.run).toBe('new');
  });

  it('returns null when no comment has a marker', () => {
    expect(findLatestMarker([{ author: 'a', body: 'Hi', createdAt: '2026-01-01T00:00:00Z' }])).toBeNull();
  });
});

describe(findLatestRunMarkerDate, () => {
  it("returns the date of the latest comment that carries the run's marker", () => {
    const comments = [
      { author: 'a', body: renderMarker({ run: 'r' }), createdAt: '2026-01-01T00:00:00Z' },
      { author: 'a', body: renderMarker({ run: 'other' }), createdAt: '2026-03-01T00:00:00Z' },
    ];

    expect(findLatestRunMarkerDate(comments, 'r')).toBe('2026-01-01T00:00:00Z');
    expect(findLatestRunMarkerDate(comments, 'missing')).toBeUndefined();
  });
});
