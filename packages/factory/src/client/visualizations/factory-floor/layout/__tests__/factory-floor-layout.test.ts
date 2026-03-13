import { describe, expect, it } from 'vitest';

import {
  CODER_X,
  HOLISTIC_X,
  LOWER_LEFT_MARGIN,
  LOWER_PLATFORM_Y,
  PLATFORM_WIDTH,
  RAIL_Y,
  REVIEWER_SPACING,
  SIMPLIFIER_X,
  SUMMARY_X,
  UPPER_LEFT_MARGIN,
  UPPER_PLATFORM_Y,
  UPPER_STATION_GAP,
} from '../../constants/dimensions.js';
import {
  computeFactoryFloorLayout,
  type FactoryFloorLayoutConfig,
  type StationLayoutEntry,
} from '../factory-floor-layout.js';

/** Standard 7-station configuration used across multiple test cases. */
function defaultStations(reviewerCount = 1): readonly StationLayoutEntry[] {
  return [
    { agentCount: 1 }, // 0: architecture
    { agentCount: 1 }, // 1: planning
    { agentCount: 1 }, // 2: implementation
    { agentCount: reviewerCount }, // 3: review
    { agentCount: 1 }, // 4: simplifier
    { agentCount: 1 }, // 5: holistic
    { agentCount: 0 }, // 6: summary
  ];
}

function buildConfig(reviewerCount = 1): FactoryFloorLayoutConfig {
  return { stations: defaultStations(reviewerCount) };
}

describe(computeFactoryFloorLayout, () => {
  describe('zone Y positions', () => {
    it('places upper-zone stations at UPPER_PLATFORM_Y', () => {
      const layout = computeFactoryFloorLayout(buildConfig());

      expect(layout.stationPosition(0).y).toBe(UPPER_PLATFORM_Y);
      expect(layout.stationPosition(1).y).toBe(UPPER_PLATFORM_Y);
    });

    it('places rail-zone stations at RAIL_Y', () => {
      const layout = computeFactoryFloorLayout(buildConfig());

      expect(layout.stationPosition(2).y).toBe(RAIL_Y);
      expect(layout.stationPosition(6).y).toBe(RAIL_Y);
    });

    it('places lower-zone stations at LOWER_PLATFORM_Y', () => {
      const layout = computeFactoryFloorLayout(buildConfig());

      expect(layout.stationPosition(3).y).toBe(LOWER_PLATFORM_Y);
      expect(layout.stationPosition(4).y).toBe(LOWER_PLATFORM_Y);
      expect(layout.stationPosition(5).y).toBe(LOWER_PLATFORM_Y);
    });
  });

  describe('station X positions', () => {
    it('places Architect at UPPER_LEFT_MARGIN', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.stationPosition(0).x).toBe(UPPER_LEFT_MARGIN);
    });

    it('places Planner to the right of Architect', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.stationPosition(1).x).toBe(UPPER_LEFT_MARGIN + UPPER_STATION_GAP);
    });

    it('places Coder at CODER_X', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.stationPosition(2).x).toBe(CODER_X);
    });

    it('places Summary at SUMMARY_X', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.stationPosition(6).x).toBe(SUMMARY_X);
    });

    it('places Simplifier at SIMPLIFIER_X', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.stationPosition(4).x).toBe(SIMPLIFIER_X);
    });

    it('places Holistic at HOLISTIC_X', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.stationPosition(5).x).toBe(HOLISTIC_X);
    });
  });

  describe('orchestrator position', () => {
    it('always returns RAIL_Y for orchestrator', () => {
      const layout = computeFactoryFloorLayout(buildConfig());

      for (let i = 0; i < 7; i++) {
        expect(layout.orchestratorPosition(i).y).toBe(RAIL_Y);
      }
    });

    it('orchestrator X matches station X', () => {
      const layout = computeFactoryFloorLayout(buildConfig());

      for (let i = 0; i < 7; i++) {
        expect(layout.orchestratorPosition(i).x).toBe(layout.stationPosition(i).x);
      }
    });
  });

  describe('dual-anchor stability', () => {
    it('Simplifier and Holistic positions are constant regardless of reviewer count', () => {
      const layouts = [1, 2, 3, 4, 5].map((count) => computeFactoryFloorLayout(buildConfig(count)));

      for (const layout of layouts) {
        expect(layout.stationPosition(4).x).toBe(SIMPLIFIER_X);
        expect(layout.stationPosition(5).x).toBe(HOLISTIC_X);
      }
    });

    it('upper-zone positions are constant regardless of reviewer count', () => {
      const layouts = [1, 2, 3, 4, 5].map((count) => computeFactoryFloorLayout(buildConfig(count)));

      for (const layout of layouts) {
        expect(layout.stationPosition(0).x).toBe(UPPER_LEFT_MARGIN);
        expect(layout.stationPosition(1).x).toBe(UPPER_LEFT_MARGIN + UPPER_STATION_GAP);
      }
    });

    it('rail-zone positions are constant regardless of reviewer count', () => {
      const layouts = [1, 2, 3, 4, 5].map((count) => computeFactoryFloorLayout(buildConfig(count)));

      for (const layout of layouts) {
        expect(layout.stationPosition(2).x).toBe(CODER_X);
        expect(layout.stationPosition(6).x).toBe(SUMMARY_X);
      }
    });
  });

  describe('platform width constancy', () => {
    it('platform width is constant regardless of reviewer count', () => {
      const widths = [0, 1, 2, 3, 5].map((count) => computeFactoryFloorLayout(buildConfig(count)).platformWidth);

      for (const width of widths) {
        expect(width).toBe(PLATFORM_WIDTH);
      }
    });
  });

  describe('reviewer positions', () => {
    it('single reviewer at LOWER_LEFT_MARGIN', () => {
      const layout = computeFactoryFloorLayout(buildConfig(1));
      const pos = layout.agentPosition(3, 0, 1);
      expect(pos.x).toBe(LOWER_LEFT_MARGIN);
      expect(pos.y).toBe(LOWER_PLATFORM_Y);
    });

    it('multiple reviewers spread with REVIEWER_SPACING', () => {
      const layout = computeFactoryFloorLayout(buildConfig(3));

      expect(layout.agentPosition(3, 0, 3).x).toBe(LOWER_LEFT_MARGIN);
      expect(layout.agentPosition(3, 1, 3).x).toBe(LOWER_LEFT_MARGIN + REVIEWER_SPACING);
      expect(layout.agentPosition(3, 2, 3).x).toBe(LOWER_LEFT_MARGIN + 2 * REVIEWER_SPACING);
    });
  });

  describe('chute direction', () => {
    it('upper-zone stations have chutes', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.hasChute(0)).toBe(true);
      expect(layout.hasChute(1)).toBe(true);
    });

    it('lower-zone stations have chutes', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.hasChute(3)).toBe(true);
      expect(layout.hasChute(4)).toBe(true);
      expect(layout.hasChute(5)).toBe(true);
    });

    it('rail-level stations have no chute', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(layout.hasChute(2)).toBe(false);
      expect(layout.hasChute(6)).toBe(false);
    });

    it('upper-zone chute runs from rail upward toward agent', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      const chute = layout.chuteEndpoints(0, 0, 1);

      // For upper zone: topY should be closer to UPPER_PLATFORM_Y, botY closer to RAIL_Y
      expect(chute.topY).toBeLessThan(chute.botY);
      expect(chute.topY).toBeLessThan(RAIL_Y);
      expect(chute.botY).toBeLessThan(RAIL_Y);
    });

    it('lower-zone chute runs from rail downward toward agent', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      const chute = layout.chuteEndpoints(3, 0, 1);

      // For lower zone: topY should be closer to RAIL_Y, botY closer to LOWER_PLATFORM_Y
      expect(chute.topY).toBeGreaterThan(RAIL_Y);
      expect(chute.topY).toBeLessThan(chute.botY);
    });

    it('throws when requesting chute for rail-level station', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(() => layout.chuteEndpoints(2, 0, 1)).toThrow();
      expect(() => layout.chuteEndpoints(6, 0, 0)).toThrow();
    });
  });

  describe('zone assignment', () => {
    it('returns correct zone for each station', () => {
      const layout = computeFactoryFloorLayout(buildConfig());

      expect(layout.zoneOf(0)).toBe('upper');
      expect(layout.zoneOf(1)).toBe('upper');
      expect(layout.zoneOf(2)).toBe('rail');
      expect(layout.zoneOf(3)).toBe('lower');
      expect(layout.zoneOf(4)).toBe('lower');
      expect(layout.zoneOf(5)).toBe('lower');
      expect(layout.zoneOf(6)).toBe('rail');
    });
  });

  describe('determinism', () => {
    it('produces identical results for the same configuration', () => {
      const config = buildConfig(3);
      const layout1 = computeFactoryFloorLayout(config);
      const layout2 = computeFactoryFloorLayout(config);

      for (let i = 0; i < 7; i++) {
        expect(layout1.stationPosition(i)).toEqual(layout2.stationPosition(i));
        expect(layout1.orchestratorPosition(i)).toEqual(layout2.orchestratorPosition(i));
      }

      expect(layout1.platformWidth).toBe(layout2.platformWidth);
      expect(layout1.bounds).toEqual(layout2.bounds);
    });
  });

  describe('edge cases', () => {
    it('throws when stations array is empty', () => {
      expect(() => computeFactoryFloorLayout({ stations: [] })).toThrow('At least one station is required');
    });

    it('throws when station index is out of range', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      expect(() => layout.stationPosition(-1)).toThrow();
      expect(() => layout.stationPosition(7)).toThrow();
    });

    it('handles 0 reviewers gracefully', () => {
      const layout = computeFactoryFloorLayout(buildConfig(0));
      // agentCount 0 should be treated as at least 1 for spacing
      const pos = layout.agentPosition(3, 0, 0);
      expect(pos.x).toBe(LOWER_LEFT_MARGIN);
      expect(pos.y).toBe(LOWER_PLATFORM_Y);
    });

    it('handles many reviewers without affecting other positions', () => {
      const layout = computeFactoryFloorLayout(buildConfig(10));

      // Upper zone unchanged
      expect(layout.stationPosition(0).x).toBe(UPPER_LEFT_MARGIN);
      expect(layout.stationPosition(1).x).toBe(UPPER_LEFT_MARGIN + UPPER_STATION_GAP);

      // Rail zone unchanged
      expect(layout.stationPosition(2).x).toBe(CODER_X);
      expect(layout.stationPosition(6).x).toBe(SUMMARY_X);

      // Right-anchored lower zone unchanged
      expect(layout.stationPosition(4).x).toBe(SIMPLIFIER_X);
      expect(layout.stationPosition(5).x).toBe(HOLISTIC_X);

      // Platform width unchanged
      expect(layout.platformWidth).toBe(PLATFORM_WIDTH);
    });
  });

  describe('zone boundary lines', () => {
    it('upper boundary line is between UPPER_PLATFORM_Y and RAIL_Y', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      const boundary = layout.upperBoundaryEndpoints();

      expect(boundary.y).toBeGreaterThan(UPPER_PLATFORM_Y);
      expect(boundary.y).toBeLessThan(RAIL_Y);
    });

    it('lower boundary line is between RAIL_Y and LOWER_PLATFORM_Y', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      const boundary = layout.lowerBoundaryEndpoints();

      expect(boundary.y).toBeGreaterThan(RAIL_Y);
      expect(boundary.y).toBeLessThan(LOWER_PLATFORM_Y);
    });
  });

  describe('rail endpoints', () => {
    it('rail line is at RAIL_Y', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      const rail = layout.railEndpoints();
      expect(rail.y).toBe(RAIL_Y);
    });

    it('rail extends beyond the platform margins', () => {
      const layout = computeFactoryFloorLayout(buildConfig());
      const rail = layout.railEndpoints();
      expect(rail.x1).toBeLessThan(UPPER_LEFT_MARGIN);
      expect(rail.x2).toBeGreaterThan(SUMMARY_X);
    });
  });
});
