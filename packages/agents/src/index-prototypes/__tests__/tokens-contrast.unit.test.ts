import { describe, expect, it } from 'vitest';

import { CONTRAST_PAIRINGS, THEME_NAMES, THEME_TOKENS } from '../tokens.ts';

describe('index page colour tokens', () => {
  const cases = THEME_NAMES.flatMap((theme) => CONTRAST_PAIRINGS.map((pairing) => ({ theme, ...pairing })));

  it.each(cases)(
    '$theme: $foreground on $background meets $minimumRatio:1',
    ({ theme, foreground, background, minimumRatio }) => {
      const ratio = computeContrastRatio(THEME_TOKENS[theme][foreground], THEME_TOKENS[theme][background]);

      expect(ratio).toBeGreaterThanOrEqual(minimumRatio);
    },
  );

  it('computes the reference ratio for black on white', () => {
    expect(computeContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});

// region | Helpers

/** Computes the WCAG 2.2 contrast ratio between two opaque `#rrggbb` colours. */
function computeContrastRatio(first: string, second: string): number {
  const [lighter, darker] = [computeRelativeLuminance(first), computeRelativeLuminance(second)].toSorted(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** Computes the WCAG relative luminance of an opaque `#rrggbb` colour. */
function computeRelativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) {
    throw new Error(`expected an opaque #rrggbb colour, got ${hex}`);
  }
  const [red, green, blue] = match.slice(1).map((channel) => linearizeChannel(Number.parseInt(channel, 16) / 255));
  return 0.212_6 * (red ?? 0) + 0.715_2 * (green ?? 0) + 0.072_2 * (blue ?? 0);
}

/** Converts a gamma-encoded sRGB channel in [0, 1] to linear light. */
function linearizeChannel(value: number): number {
  return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// endregion | Helpers
