// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { MINIMAL_LAYOUT } from '../../../test-utils/minimal-layout.ts';
import { CANVAS_KEY_ENTRIES } from '../canvas-key-entries.tsx';
import type { ChartMark } from '../list-chart-marks.ts';
import { renderCanvas } from '../test-utils/render-canvas.tsx';

describe('CANVAS_KEY_ENTRIES', () => {
  it('has one entry for each kind of mark', () => {
    expect(CANVAS_KEY_ENTRIES.map(({ id }) => id).toSorted()).toStrictEqual([...ALL_MARKS]);
  });
});

describe('StatechartCanvas renderKey', () => {
  it('receives the marks that the chart draws, and renders what it returns below the chart', () => {
    renderCanvas(buildMinimalConfig(), MINIMAL_LAYOUT, undefined, {
      renderKey: (marks) => (
        <ul aria-label="Key">
          {[...marks].map((mark) => (
            <li key={mark}>{mark}</li>
          ))}
        </ul>
      ),
    });

    const entries = within(screen.getByRole('list', { name: 'Key' })).getAllByRole('listitem');
    expect(entries.map((entry) => entry.textContent).toSorted()).toStrictEqual([
      'ends',
      'starts-here',
      'waits-for-user',
    ]);
  });
});

// region | Helpers
const ALL_MARKS: readonly ChartMark[] = [
  'any-time',
  'ends',
  'fallback',
  'gate',
  'inferred',
  'no-alternative',
  'no-exit',
  'starts-here',
  'unreachable',
  'waits-for-user',
];
// endregion | Helpers
