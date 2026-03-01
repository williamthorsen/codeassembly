import { describe, expect, it } from 'vitest';

import { computeLayout } from '../platform-layout.js';

describe('computeLayout', () => {
  describe('platforms', () => {
    it('returns only the main platform for 0 reviewers', () => {
      const layout = computeLayout(0);

      expect(layout.platforms).toHaveLength(1);
      expect(layout.platforms[0]).toEqual({
        x: 650,
        y: 400,
        width: 1100,
        height: 20,
      });
    });

    it('returns only the main platform for 1 reviewer', () => {
      const layout = computeLayout(1);

      expect(layout.platforms).toHaveLength(1);
    });

    it('returns main + 1 upper platform for 2 reviewers', () => {
      const layout = computeLayout(2);

      expect(layout.platforms).toHaveLength(2);
      expect(layout.platforms[1]).toEqual(
        expect.objectContaining({
          y: 400 - 56,
          width: 100,
          height: 20,
        }),
      );
    });

    it('returns main + 2 upper platforms for 3 reviewers', () => {
      const layout = computeLayout(3);

      expect(layout.platforms).toHaveLength(3);
      expect(layout.platforms[1]?.y).toBe(400 - 56);
      expect(layout.platforms[2]?.y).toBe(400 - 2 * 56);
    });

    it('centers upper platforms above the review station', () => {
      const layout = computeLayout(2);
      const reviewStationX = 200 + 3 * 150;

      expect(layout.platforms[1]?.x).toBe(reviewStationX);
    });
  });

  describe('ladders', () => {
    it('returns no ladders for 0 reviewers', () => {
      const layout = computeLayout(0);

      expect(layout.ladders).toHaveLength(0);
    });

    it('returns no ladders for 1 reviewer', () => {
      const layout = computeLayout(1);

      expect(layout.ladders).toHaveLength(0);
    });

    it('returns 1 ladder for 2 reviewers', () => {
      const layout = computeLayout(2);

      expect(layout.ladders).toHaveLength(1);
      // bottomY/topY align with platform surfaces (baseY - level*levelHeight - platformHeight/2)
      expect(layout.ladders[0]).toEqual(
        expect.objectContaining({
          bottomY: 390,
          topY: 390 - 56,
        }),
      );
    });

    it('returns 2 ladders for 3 reviewers', () => {
      const layout = computeLayout(3);

      expect(layout.ladders).toHaveLength(2);
      expect(layout.ladders[0]?.bottomY).toBe(390);
      expect(layout.ladders[0]?.topY).toBe(390 - 56);
      expect(layout.ladders[1]?.bottomY).toBe(390 - 56);
      expect(layout.ladders[1]?.topY).toBe(390 - 2 * 56);
    });

    it('positions ladder to the left of the upper platform', () => {
      const layout = computeLayout(2);
      const reviewStationX = 200 + 3 * 150; // 650
      const upperPlatformWidth = 100;

      // ladder X = reviewStationX - upperPlatformWidth / 2 - 16 = 650 - 50 - 16 = 584
      expect(layout.ladders[0]?.x).toBe(reviewStationX - upperPlatformWidth / 2 - 16);
    });
  });

  describe('station positions', () => {
    it('returns 7 station positions', () => {
      const layout = computeLayout(0);

      expect(layout.stationPositions).toHaveLength(7);
    });

    it('spaces stations evenly from startX', () => {
      const layout = computeLayout(0);

      expect(layout.stationPositions[0]?.x).toBe(200);
      expect(layout.stationPositions[1]?.x).toBe(350);
      expect(layout.stationPositions[6]?.x).toBe(200 + 6 * 150);
    });

    it('positions station centers so bottom edge meets platform surface', () => {
      const layout = computeLayout(0);

      // baseY - platformHeight/2 - 20 = 400 - 10 - 20 = 370
      for (const pos of layout.stationPositions) {
        expect(pos.y).toBe(370);
      }
    });
  });

  describe('gate positions', () => {
    it('returns 6 gate positions', () => {
      const layout = computeLayout(0);

      expect(layout.gatePositions).toHaveLength(6);
    });

    it('positions gates between adjacent stations', () => {
      const layout = computeLayout(0);

      expect(layout.gatePositions[0]?.x).toBe(200 + 0.5 * 150);
      expect(layout.gatePositions[5]?.x).toBe(200 + 5.5 * 150);
    });

    it('positions gate centers so bottom edge meets platform surface', () => {
      const layout = computeLayout(0);

      // baseY - platformHeight/2 - 20 = 400 - 10 - 20 = 370
      for (const pos of layout.gatePositions) {
        expect(pos.y).toBe(370);
      }
    });
  });

  describe('agentPosition', () => {
    it('returns level-0 position using grid math', () => {
      const layout = computeLayout(2);
      const pos = layout.agentPosition(3, 0, 0);

      // stationX = 200 + 3*150 = 650
      // col=0, xOffset = (0-1)*36 = -36
      expect(pos).toEqual({ x: 650 - 36, y: 400 - 22 });
    });

    it('returns correct position for stackOffset 1 on level 0', () => {
      const layout = computeLayout(2);
      const pos = layout.agentPosition(3, 1, 0);

      // col=1, xOffset = (1-1)*36 = 0
      expect(pos).toEqual({ x: 650, y: 400 - 22 });
    });

    it('returns correct position for stackOffset 2 on level 0', () => {
      const layout = computeLayout(3);
      const pos = layout.agentPosition(3, 2, 0);

      // col=2, xOffset = (2-1)*36 = 36
      expect(pos).toEqual({ x: 650 + 36, y: 400 - 22 });
    });

    it('wraps to next row at stackOffset 3 on level 0', () => {
      const layout = computeLayout(0);
      const pos = layout.agentPosition(3, 3, 0);

      // col=0 row=1, xOffset = (0-1)*36 = -36
      expect(pos).toEqual({ x: 650 - 36, y: 400 - 22 - 38 });
    });

    it('returns upper-level position centered on review station', () => {
      const layout = computeLayout(2);
      const pos = layout.agentPosition(3, 0, 1);

      // stationX = 650, y = 400 - 1*56 - 22
      expect(pos).toEqual({ x: 650, y: 400 - 56 - 22 });
    });

    it('returns level-2 position correctly', () => {
      const layout = computeLayout(3);
      const pos = layout.agentPosition(3, 0, 2);

      expect(pos).toEqual({ x: 650, y: 400 - 2 * 56 - 22 });
    });

    it('returns approach position at level 0 (one spacing left of leftmost grid slot)', () => {
      const layout = computeLayout(1);
      const pos = layout.agentPosition(3, 0, 0, true);

      // stationX = 650; approaching x = 650 - 72 = 578; y = 400 - 22 = 378
      expect(pos).toEqual({ x: 578, y: 378 });
    });

    it('returns approach position at upper level (one spacing left of station center)', () => {
      const layout = computeLayout(2);
      const pos = layout.agentPosition(3, 0, 1, true);

      // stationX = 650; approaching x = 650 - 36 = 614; y = 400 - 56 - 22 = 322
      expect(pos).toEqual({ x: 614, y: 322 });
    });

    it('ignores stackOffset when approaching is true', () => {
      const layout = computeLayout(1);
      const posOffset0 = layout.agentPosition(3, 0, 0, true);
      const posOffset1 = layout.agentPosition(3, 1, 0, true);

      expect(posOffset0).toEqual(posOffset1);
    });
  });

  describe('artifactPosition', () => {
    it('returns position offset from station for indexAtStation 0', () => {
      const layout = computeLayout(0);
      const pos = layout.artifactPosition(0, 0);

      // x = startX(200) + 0*stationSpacing(150) + artifactOffsetX(20) + 0*(12+4) = 220
      // y = baseY(400) + artifactOffsetY(-60) = 340
      expect(pos).toEqual({ x: 220, y: 340 });
    });

    it('offsets indexAtStation 1 by artifactSize.width + artifactGap from indexAtStation 0', () => {
      const layout = computeLayout(0);
      const pos0 = layout.artifactPosition(0, 0);
      const pos1 = layout.artifactPosition(0, 1);

      // Default: width=12, gap=4 => offset = 16
      expect(pos1.x - pos0.x).toBe(16);
      expect(pos1.y).toBe(pos0.y);
    });

    it('offsets indexAtStation 2 with correct cumulative offset', () => {
      const layout = computeLayout(0);
      const pos0 = layout.artifactPosition(0, 0);
      const pos2 = layout.artifactPosition(0, 2);

      // 2 * (12 + 4) = 32
      expect(pos2.x - pos0.x).toBe(32);
    });

    it('respects custom artifactOffsetX, artifactGap, and artifactSize', () => {
      const layout = computeLayout(0, {
        artifactOffsetX: 10,
        artifactGap: 6,
        artifactSize: { width: 20, height: 20 },
      });
      const pos0 = layout.artifactPosition(0, 0);
      const pos1 = layout.artifactPosition(0, 1);

      // x = 200 + 0*150 + 10 + 0*(20+6) = 210
      expect(pos0.x).toBe(210);
      // x = 200 + 0*150 + 10 + 1*(20+6) = 236
      expect(pos1.x).toBe(236);
    });
  });

  describe('artifactSize', () => {
    it('equals default { width: 12, height: 12 }', () => {
      const layout = computeLayout(0);

      expect(layout.artifactSize).toEqual({ width: 12, height: 12 });
    });

    it('reflects custom config values', () => {
      const layout = computeLayout(0, { artifactSize: { width: 20, height: 20 } });

      expect(layout.artifactSize).toEqual({ width: 20, height: 20 });
    });
  });

  describe('bounds', () => {
    it('returns bounds that contain all stations with margin', () => {
      const layout = computeLayout(0);

      expect(layout.bounds.minX).toBeLessThan(200);
      expect(layout.bounds.maxX).toBeGreaterThan(200 + 6 * 150);
    });

    it('returns identical bounds for 0 and 1 reviewer (both have upperLevelCount = 0)', () => {
      const layout0 = computeLayout(0);
      const layout1 = computeLayout(1);

      expect(layout1.bounds).toEqual(layout0.bounds);
    });

    it('expands minY upward when upper levels exist', () => {
      const layout0 = computeLayout(0);
      const layout2 = computeLayout(2);

      expect(layout2.bounds.minY).toBeLessThan(layout0.bounds.minY);
    });

    it('expands further upward for more levels', () => {
      const layout2 = computeLayout(2);
      const layout3 = computeLayout(3);

      expect(layout3.bounds.minY).toBeLessThan(layout2.bounds.minY);
    });
  });

  describe('configurable constants', () => {
    it('uses custom levelHeight', () => {
      const layout = computeLayout(2, { levelHeight: 100 });

      expect(layout.platforms[1]?.y).toBe(400 - 100);
    });

    it('uses custom stationSpacing', () => {
      const layout = computeLayout(0, { stationSpacing: 200 });

      expect(layout.stationPositions[1]?.x).toBe(200 + 200);
    });

    it('uses custom startX', () => {
      const layout = computeLayout(0, { startX: 100 });

      expect(layout.stationPositions[0]?.x).toBe(100);
    });
  });
});
