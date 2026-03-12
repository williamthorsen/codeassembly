import type { Palette } from './svg-renderer.ts';

// ── HSL palette generator ──────────────────────────────────────────────────

/** Converts an HSL color (h in degrees, s and l in 0-100) to a hex string. */
function hslToHex(h: number, s: number, l: number): string {
  const satNorm = s / 100;
  const lightNorm = l / 100;
  // Chroma: the colorfulness, highest when lightness is 50% and saturation is 100%
  const chroma = (1 - Math.abs(2 * lightNorm - 1)) * satNorm;
  // Secondary: the second-largest RGB component, determined by position within the 60° hue sector
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  // Lightness offset: added to all channels to shift from pure chroma values to the target lightness
  const lightnessOffset = lightNorm - chroma / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = chroma;
    g = secondary;
  } else if (h < 120) {
    r = secondary;
    g = chroma;
  } else if (h < 180) {
    g = chroma;
    b = secondary;
  } else if (h < 240) {
    g = secondary;
    b = chroma;
  } else if (h < 300) {
    r = secondary;
    b = chroma;
  } else {
    r = chroma;
    b = secondary;
  }

  function toHex(channel: number): string {
    return Math.round((channel + lightnessOffset) * 255)
      .toString(16)
      .padStart(2, '0');
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Generates a 5-shade palette by evenly spacing lightness between min and max at the given hue/saturation. */
function generatePalette(hue: number, saturation: number, minLightness: number, maxLightness: number): Palette {
  const shades: string[] = [];
  for (let i = 0; i < 5; i++) {
    const l = minLightness + (i * (maxLightness - minLightness)) / 4;
    shades.push(hslToHex(hue, saturation, l));
  }
  // Type-safe: we know there are exactly 5 elements but TS can't verify the spread
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- tuple length guaranteed by the loop above
  return ['', ...shades] as Palette;
}

// ── Tuning constants ───────────────────────────────────────────────────────

/** Subagent palette: cyan/teal hue with raised lightness for contrast against the dark (#1a1a2e) background. */
export const SUBAGENT_HSL = {
  hue: 195,
  saturation: 45,
  minLightness: 28,
  maxLightness: 72,
} as const;

/** Orchestrator palette: warm gold with boosted saturation and lightness. */
export const ORCHESTRATOR_HSL = {
  hue: 42,
  saturation: 72,
  minLightness: 22,
  maxLightness: 80,
} as const;

// ── Exported palettes ──────────────────────────────────────────────────────

/** Cyan/teal metallic palette for the subagent robot, tuned for visibility against the dark catwalk background. */
export const SUBAGENT_PALETTE: Palette = generatePalette(
  SUBAGENT_HSL.hue,
  SUBAGENT_HSL.saturation,
  SUBAGENT_HSL.minLightness,
  SUBAGENT_HSL.maxLightness,
);

const basePalette = generatePalette(
  ORCHESTRATOR_HSL.hue,
  ORCHESTRATOR_HSL.saturation,
  ORCHESTRATOR_HSL.minLightness,
  ORCHESTRATOR_HSL.maxLightness,
);

/** Gold command-unit palette for the orchestrator robot, with beacon bright at index 6. */
export const ORCHESTRATOR_PALETTE: Palette = [...basePalette, '#fff5c0'] as Palette;
