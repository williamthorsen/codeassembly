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

    it('has correct dimensions (96x96 for 3x3 grid)', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      expect(svg).toContain('width="96"');
      expect(svg).toContain('height="96"');
    });

    it('contains 9 frames total (2 idle + 1 walking + 3 working + 2 celebrating + 1 concerned)', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Idle: 3 elements each (circle + rect + line) x 2 = 6
      // Walking: 3 elements x 1 = 3
      // Working: 3 elements each x 3 = 9
      // Celebrating: 4 elements each (circle + rect + 2 lines) x 2 = 8
      // Concerned: 4 elements (circle + rect + 2 lines) x 1 = 4
      const circleCount = (svg.match(/<circle /g) ?? []).length;
      const rectCount = (svg.match(/<rect /g) ?? []).length;
      const lineCount = (svg.match(/<line /g) ?? []).length;

      // 9 frames, each has 1 circle
      expect(circleCount).toBe(9);
      // 9 frames, each has 1 rect
      expect(rectCount).toBe(9);
      // 5 single-arm frames + 3 dual-arm frames = 5 + 6 = 11
      // Single-arm: 2 idle + 1 walking + 3 working = 6
      // Dual-arm: 2 celebrating + 1 concerned = 3 (each has 2 lines)
      expect(lineCount).toBe(6 + 6);
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

  describe('walking frame (row 0, col 2)', () => {
    it('positions walking frame head with side-step offset', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 2, row 0: cx = 2*32 + 16 + 3 = 83, headCy = 10
      expect(svg).toContain('cx="83" cy="10"');
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

  describe('celebrating frames (row 2, cols 0-1)', () => {
    it('positions celebrating frame heads in row 2', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 0, row 2: cx = 16, headCy = 64 + 8 = 72
      expect(svg).toContain('cx="16" cy="72"');
      // Col 1, row 2: cx = 48, headCy = 72
      expect(svg).toContain('cx="48" cy="72"');
    });

    it('renders two arm lines per celebrating frame', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Celebrating frames at row 2 have dual arms
      // Col 0, row 2: bodyCy = 64 + 20 = 84, armStartY = 80
      // Both arms start from (16, 80)
      const armMatches = svg.match(/x1="16" y1="80"/g);
      expect(armMatches).toHaveLength(2);
    });
  });

  describe('concerned frame (row 2, col 2)', () => {
    it('positions concerned frame head in row 2, col 2', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 2, row 2: cx = 80, headCy = 64 + 10 = 74
      expect(svg).toContain('cx="80" cy="74"');
    });

    it('renders two arm lines reaching to head level', () => {
      const svg = generateSpriteSheetSvg('orchestrator');

      // Col 2, row 2: cx = 80, bodyCy = 64 + 22 = 86, armStartY = 82
      // Left arm: (80, 82) -> (75, 74)
      // Right arm: (80, 82) -> (85, 74)
      expect(svg).toContain('x1="80" y1="82" x2="75" y2="74"');
      expect(svg).toContain('x1="80" y1="82" x2="85" y2="74"');
    });
  });
});
