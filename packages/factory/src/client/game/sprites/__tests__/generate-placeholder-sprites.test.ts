import { describe, expect, it, vi } from 'vitest';

vi.mock('excalibur', () => ({
  AnimationStrategy: {
    End: 'end',
    Loop: 'loop',
    PingPong: 'pingpong',
    Freeze: 'freeze',
  },
}));

const { ROLE_TYPE_COLORS, ROLE_TYPES } = await import('../../../../shared/constants/role-types.js');
const { generateSpriteSheetSvg } = await import('../generate-placeholder-sprites.js');

describe('generateSpriteSheetSvg', () => {
  describe('SVG structure', () => {
    it('produces valid SVG markup with correct xmlns', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toMatch(/^<svg /);
      expect(svg).toMatch(/<\/svg>$/);
    });

    it('has correct dimensions (96x64)', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      expect(svg).toContain('width="96"');
      expect(svg).toContain('height="64"');
    });

    it('contains 5 frames total (2 idle + 3 working)', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Each frame renders a circle (head), rect (body), and line (arm)
      const circleCount = (svg.match(/<circle /g) ?? []).length;
      const rectCount = (svg.match(/<rect /g) ?? []).length;
      const lineCount = (svg.match(/<line /g) ?? []).length;

      expect(circleCount).toBe(5);
      expect(rectCount).toBe(5);
      expect(lineCount).toBe(5);
    });
  });

  describe('role type colors', () => {
    it.each([...ROLE_TYPES])('uses the correct color for "%s"', (roleType) => {
      const svg = generateSpriteSheetSvg(roleType);
      const expectedColor = ROLE_TYPE_COLORS[roleType];

      expect(svg).toContain(`fill="${expectedColor}"`);
      expect(svg).toContain(`stroke="${expectedColor}"`);
    });
  });

  describe('idle frames (row 0)', () => {
    it('positions the first idle frame head at center of frame (16, 10) with no y-offset', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 0, row 0, yOffset 0: cx = 0*32 + 16 = 16, headCy = 0*32 + 10 + 0 = 10
      expect(svg).toContain('cx="16" cy="10"');
    });

    it('applies the bobbing y-offset of -2 to the second idle frame', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 1, row 0, yOffset -2: cx = 1*32 + 16 = 48, headCy = 0*32 + 10 + (-2) = 8
      expect(svg).toContain('cx="48" cy="8"');
    });
  });

  describe('working frames (row 1)', () => {
    it('positions working frame heads in row 1 with no y-offset', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 0, row 1: cx = 16, headCy = 32 + 10 = 42
      expect(svg).toContain('cx="16" cy="42"');
      // Col 1, row 1: cx = 48, headCy = 42
      expect(svg).toContain('cx="48" cy="42"');
      // Col 2, row 1: cx = 80, headCy = 42
      expect(svg).toContain('cx="80" cy="42"');
    });

    it('applies arm angle of 30 degrees to the second working frame', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 1, row 1, armAngle=30: pivot at (48, 50), length 8
      // armEndX = 48 + 8 * sin(30deg) = 52
      // armEndY = 50 - 8 * cos(30deg) = ~43.072
      const lineMatch = svg.match(/x1="48" y1="50" x2="([^"]+)" y2="([^"]+)"/);
      expect(lineMatch).toEqual(expect.arrayContaining([expect.any(String), expect.any(String)]));

      const armEndX = Number.parseFloat(lineMatch?.[1] ?? '');
      const armEndY = Number.parseFloat(lineMatch?.[2] ?? '');

      expect(armEndX).toBeCloseTo(52, 5);
      expect(armEndY).toBeCloseTo(43.0718, 3);
    });

    it('applies arm angle of -20 degrees to the third working frame', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 2, row 1, armAngle=-20: pivot at (80, 50), length 8
      // armEndX = 80 + 8 * sin(-20deg) = ~77.264
      // armEndY = 50 - 8 * cos(-20deg) = ~42.482
      const lineMatch = svg.match(/x1="80" y1="50" x2="([^"]+)" y2="([^"]+)"/);
      expect(lineMatch).toEqual(expect.arrayContaining([expect.any(String), expect.any(String)]));

      const armEndX = Number.parseFloat(lineMatch?.[1] ?? '');
      const armEndY = Number.parseFloat(lineMatch?.[2] ?? '');

      expect(armEndX).toBeCloseTo(77.2636, 3);
      expect(armEndY).toBeCloseTo(42.4825, 3);
    });

    it('renders a straight arm (angle 0) for the first working frame', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 0, row 1, armAngle=0: pivot at (16, 50), length 8
      // armEndX = 16 + 8 * sin(0) = 16
      // armEndY = 50 - 8 * cos(0) = 42
      expect(svg).toContain('x1="16" y1="50" x2="16" y2="42"');
    });
  });
});
