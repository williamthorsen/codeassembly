import { describe, expect, it } from 'vitest';

import {
  ACCENT_BAR_H,
  AGENT_RADIUS,
  ART_H,
  ART_W,
  ARTIFACT_TOP_MARGIN,
  ARTIFACT_Y_GAP,
  CANVAS_H,
  CHUTE_BOT_ABOVE_GROUND,
  CHUTE_TOP_BELOW_RAIL,
  DIVIDER_FIXED_DEPTH,
  DIVIDER_LEFT_OF_AGENT,
  GROUND_LINE_Y,
  LAYOUT_MARGIN,
  RAIL_OVERSHOOT,
  RAIL_Y,
  SPRITE_SIZE,
  STATION_GAP,
  STATION_LABEL_BELOW_GROUND,
} from '../../constants/dimensions.js';
import { type CatwalkLayoutConfig, computeCatwalkLayout, type StationLayoutEntry } from '../catwalk-layout.js';

// Derived constants (matching the module's internal values) for relational assertions
const AGENT_SPACING = AGENT_RADIUS * 2 + 20;
const INPUT_OVERHANG = ART_W * 1.5 + 11;
const OUTPUT_OVERHANG = ART_W / 2;
const ABSENT_X = -200;

function agentHalfWidth(agentCount: number): number {
  return ((Math.max(agentCount, 1) - 1) * AGENT_SPACING) / 2;
}

function leftExtentOf(agentCount: number): number {
  return agentHalfWidth(agentCount) + INPUT_OVERHANG;
}

function rightExtentOf(agentCount: number): number {
  return agentHalfWidth(agentCount) + OUTPUT_OVERHANG;
}

// Standard 7-station configuration used across multiple test cases
const defaultStations: readonly StationLayoutEntry[] = [
  { agentCount: 1 }, // architecture
  { agentCount: 1 }, // planning
  { agentCount: 1 }, // implementation
  { agentCount: 4 }, // review
  { agentCount: 1 }, // simplifier
  { agentCount: 1 }, // holistic
  { agentCount: 0 }, // summary (no agents)
];

const defaultConfig: CatwalkLayoutConfig = { stations: defaultStations };

describe('computeCatwalkLayout', () => {
  describe('1. default layout', () => {
    it('places the first station at LAYOUT_MARGIN + INPUT_OVERHANG', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.stationX(0)).toBe(LAYOUT_MARGIN + INPUT_OVERHANG);
    });

    it('has monotonically increasing station X positions', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      for (let i = 0; i < defaultStations.length - 1; i++) {
        expect(layout.stationX(i + 1)).toBeGreaterThan(layout.stationX(i));
      }
    });

    it('computes platformWidth as last stationX + right extent + LAYOUT_MARGIN', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const lastIndex = defaultStations.length - 1;
      const lastStation = defaultStations[lastIndex];
      if (lastStation === undefined) throw new Error('no stations');
      const expected = layout.stationX(lastIndex) + rightExtentOf(lastStation.agentCount) + LAYOUT_MARGIN;

      expect(layout.platformWidth).toBe(expected);
    });

    it('spaces consecutive stations by right extent + STATION_GAP + left extent', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      for (let k = 0; k < defaultStations.length - 1; k++) {
        const current = defaultStations[k];
        const next = defaultStations[k + 1];
        if (current === undefined || next === undefined) throw new Error('missing station');
        const expectedNext = Math.round(
          layout.stationX(k) + rightExtentOf(current.agentCount) + STATION_GAP + leftExtentOf(next.agentCount),
        );
        expect(layout.stationX(k + 1)).toBe(expectedNext);
      }
    });
  });

  describe('2. agent positions within a station', () => {
    it('spreads agents symmetrically around stationX for the review station', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const leftmost = layout.agentPosition(3, 0, 4);
      const rightmost = layout.agentPosition(3, 3, 4);
      const midpoint = (leftmost.x + rightmost.x) / 2;

      expect(midpoint).toBe(layout.stationX(3));
    });

    it('spaces consecutive agents by AGENT_SPACING', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      for (let k = 0; k < 3; k++) {
        const current = layout.agentPosition(3, k, 4);
        const next = layout.agentPosition(3, k + 1, 4);
        expect(next.x - current.x).toBe(AGENT_SPACING);
      }
    });

    it('places all agents at y === GROUND_LINE_Y', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      for (let slot = 0; slot < 4; slot++) {
        expect(layout.agentPosition(3, slot, 4).y).toBe(GROUND_LINE_Y);
      }
    });
  });

  describe('3. single-agent station', () => {
    it('centers the single agent on stationX', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.agentPosition(0, 0, 1).x).toBe(layout.stationX(0));
    });

    it('places the single agent at y === GROUND_LINE_Y', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.agentPosition(0, 0, 1).y).toBe(GROUND_LINE_Y);
    });
  });

  describe('4. orchestrator position', () => {
    it('has x equal to stationX for every station', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      for (let i = 0; i < defaultStations.length; i++) {
        expect(layout.orchestratorPosition(i).x).toBe(layout.stationX(i));
      }
    });

    it('has y equal to RAIL_Y for every station', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      for (let i = 0; i < defaultStations.length; i++) {
        expect(layout.orchestratorPosition(i).y).toBe(RAIL_Y);
      }
    });
  });

  describe('5. chute endpoints', () => {
    it('has topY equal to RAIL_Y + CHUTE_TOP_BELOW_RAIL', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.chuteEndpoints(0, 0, 1).topY).toBe(RAIL_Y + CHUTE_TOP_BELOW_RAIL);
    });

    it('has botY derived from GROUND_LINE_Y - ACCENT_BAR_H - SPRITE_SIZE - CHUTE_BOT_ABOVE_GROUND', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.chuteEndpoints(0, 0, 1).botY).toBe(
        GROUND_LINE_Y - ACCENT_BAR_H - SPRITE_SIZE - CHUTE_BOT_ABOVE_GROUND,
      );
    });

    it('is a vertical line (topX === botX)', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const chute = layout.chuteEndpoints(3, 1, 4);

      expect(chute.topX).toBe(chute.botX);
    });

    it('aligns the chute X with the agent X', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const agentPos = layout.agentPosition(3, 2, 4);
      const chute = layout.chuteEndpoints(3, 2, 4);

      expect(chute.topX).toBe(agentPos.x);
    });

    it('runs downward (botY > topY)', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const chute = layout.chuteEndpoints(0, 0, 1);

      expect(chute.botY).toBeGreaterThan(chute.topY);
    });
  });

  describe('6. gate position', () => {
    it('is at the midpoint of two adjacent stations', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const expectedX = (layout.stationX(0) + layout.stationX(1)) / 2;

      expect(layout.gatePosition(0, 1).x).toBe(expectedX);
    });

    it('has y equal to RAIL_Y', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.gatePosition(0, 1).y).toBe(RAIL_Y);
    });
  });

  describe('7. rail and ground endpoints', () => {
    it('has rail y equal to RAIL_Y', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.railEndpoints().y).toBe(RAIL_Y);
    });

    it('has ground y equal to GROUND_LINE_Y', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.groundEndpoints().y).toBe(GROUND_LINE_Y);
    });

    it('shares the same x1 and x2 for rail and ground', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const rail = layout.railEndpoints();
      const ground = layout.groundEndpoints();

      expect(rail.x1).toBe(ground.x1);
      expect(rail.x2).toBe(ground.x2);
    });

    it('has x1 equal to stationX(0) - RAIL_OVERSHOOT', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.railEndpoints().x1).toBe(layout.stationX(0) - RAIL_OVERSHOOT);
    });

    it('has x2 equal to lastVisibleStationX + RAIL_OVERSHOOT (symmetric)', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const lastIndex = defaultStations.length - 1;

      expect(layout.railEndpoints().x2).toBe(layout.stationX(lastIndex) + RAIL_OVERSHOOT);
    });

    it('has positive extent (x2 > x1)', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const rail = layout.railEndpoints();

      expect(rail.x2).toBeGreaterThan(rail.x1);
    });
  });

  describe('8. bounds', () => {
    it('has minX equal to 0', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.bounds.minX).toBe(0);
    });

    it('has maxX equal to platformWidth', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.bounds.maxX).toBe(layout.platformWidth);
    });

    it('has minY equal to 0', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.bounds.minY).toBe(0);
    });

    it('has maxY equal to CANVAS_H', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.bounds.maxY).toBe(CANVAS_H);
    });
  });

  describe('9. compact mode with absent stations', () => {
    const compactConfig: CatwalkLayoutConfig = {
      stations: [
        { agentCount: 1, absent: true }, // architecture - absent
        { agentCount: 1, absent: true }, // planning - absent
        { agentCount: 1 }, // implementation
        { agentCount: 4 }, // review
        { agentCount: 1 }, // simplifier
        { agentCount: 1 }, // holistic
        { agentCount: 0 }, // summary
      ],
      compact: true,
    };

    it('places absent stations at ABSENT_X', () => {
      const layout = computeCatwalkLayout(compactConfig);

      expect(layout.stationX(0)).toBe(ABSENT_X);
      expect(layout.stationX(1)).toBe(ABSENT_X);
    });

    it('places the first visible station at LAYOUT_MARGIN + INPUT_OVERHANG', () => {
      const layout = computeCatwalkLayout(compactConfig);

      expect(layout.stationX(2)).toBe(LAYOUT_MARGIN + INPUT_OVERHANG);
    });

    it('has monotonically increasing positions for visible stations', () => {
      const layout = computeCatwalkLayout(compactConfig);

      expect(layout.stationX(3)).toBeGreaterThan(layout.stationX(2));
      expect(layout.stationX(4)).toBeGreaterThan(layout.stationX(3));
      expect(layout.stationX(5)).toBeGreaterThan(layout.stationX(4));
      expect(layout.stationX(6)).toBeGreaterThan(layout.stationX(5));
    });

    it('produces a narrower platformWidth than non-compact', () => {
      const compactLayout = computeCatwalkLayout(compactConfig);
      const nonCompactLayout = computeCatwalkLayout({
        stations: compactConfig.stations,
      });

      expect(compactLayout.platformWidth).toBeLessThan(nonCompactLayout.platformWidth);
    });

    it('sets rail x1 relative to the first visible station', () => {
      const layout = computeCatwalkLayout(compactConfig);

      expect(layout.railEndpoints().x1).toBe(layout.stationX(2) - RAIL_OVERSHOOT);
    });

    it('sets rail x2 relative to the last visible station (symmetric)', () => {
      const layout = computeCatwalkLayout(compactConfig);

      expect(layout.railEndpoints().x2).toBe(layout.stationX(6) + RAIL_OVERSHOOT);
    });
  });

  describe('10. compact mode with no absent stations', () => {
    it('produces identical results to non-compact mode', () => {
      const compactLayout = computeCatwalkLayout({ stations: defaultStations, compact: true });
      const nonCompactLayout = computeCatwalkLayout(defaultConfig);

      expect(compactLayout.platformWidth).toBe(nonCompactLayout.platformWidth);
      for (let i = 0; i < defaultStations.length; i++) {
        expect(compactLayout.stationX(i)).toBe(nonCompactLayout.stationX(i));
      }
    });
  });

  describe('11. non-compact mode with absent flag', () => {
    it('ignores the absent flag and places stations normally', () => {
      const withAbsent = computeCatwalkLayout({
        stations: [
          { agentCount: 1, absent: true },
          { agentCount: 1 },
          { agentCount: 1 },
          { agentCount: 4 },
          { agentCount: 1 },
          { agentCount: 1 },
          { agentCount: 0 },
        ],
      });
      const withoutAbsent = computeCatwalkLayout(defaultConfig);

      expect(withAbsent.stationX(0)).toBe(withoutAbsent.stationX(0));
      expect(withAbsent.platformWidth).toBe(withoutAbsent.platformWidth);
    });
  });

  describe('12. all stations absent + compact mode', () => {
    const allAbsentConfig: CatwalkLayoutConfig = {
      stations: [
        { agentCount: 1, absent: true },
        { agentCount: 1, absent: true },
        { agentCount: 1, absent: true },
        { agentCount: 1, absent: true },
        { agentCount: 1, absent: true },
        { agentCount: 1, absent: true },
        { agentCount: 1, absent: true },
      ],
      compact: true,
    };

    it('has platformWidth equal to 2 * LAYOUT_MARGIN', () => {
      const layout = computeCatwalkLayout(allAbsentConfig);

      expect(layout.platformWidth).toBe(2 * LAYOUT_MARGIN);
    });

    it('places all stations at ABSENT_X', () => {
      const layout = computeCatwalkLayout(allAbsentConfig);

      for (let i = 0; i < 7; i++) {
        expect(layout.stationX(i)).toBe(ABSENT_X);
      }
    });
  });

  describe('13. variable reviewer counts', () => {
    function makeConfig(reviewAgentCount: number): CatwalkLayoutConfig {
      return {
        stations: [
          { agentCount: 1 },
          { agentCount: 1 },
          { agentCount: 1 },
          { agentCount: reviewAgentCount },
          { agentCount: 1 },
          { agentCount: 1 },
          { agentCount: 0 },
        ],
      };
    }

    it('grows platformWidth monotonically as agent count increases', () => {
      const widths = [1, 2, 3, 4].map((n) => computeCatwalkLayout(makeConfig(n)).platformWidth);

      for (let i = 0; i < widths.length - 1; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(widths[i + 1]!).toBeGreaterThan(widths[i]!);
      }
    });

    it('shifts downstream stations right as the review station grows', () => {
      const layout1 = computeCatwalkLayout(makeConfig(1));
      const layout4 = computeCatwalkLayout(makeConfig(4));

      for (let i = 4; i <= 6; i++) {
        expect(layout4.stationX(i)).toBeGreaterThan(layout1.stationX(i));
      }
    });

    it('keeps agents symmetric around stationX for each reviewer count', () => {
      for (const n of [1, 2, 3, 4]) {
        const layout = computeCatwalkLayout(makeConfig(n));
        const leftmost = layout.agentPosition(3, 0, n);
        const rightmost = layout.agentPosition(3, n - 1, n);
        const midpoint = (leftmost.x + rightmost.x) / 2;
        expect(midpoint).toBe(layout.stationX(3));
      }
    });

    it('centers a single agent at stationX for reviewer count 1', () => {
      const layout = computeCatwalkLayout(makeConfig(1));

      expect(layout.agentPosition(3, 0, 1).x).toBe(layout.stationX(3));
    });
  });

  describe('14. single station', () => {
    const singleConfig: CatwalkLayoutConfig = {
      stations: [{ agentCount: 1 }],
    };

    it('places the station at LAYOUT_MARGIN + INPUT_OVERHANG', () => {
      const layout = computeCatwalkLayout(singleConfig);

      expect(layout.stationX(0)).toBe(LAYOUT_MARGIN + INPUT_OVERHANG);
    });

    it('computes platformWidth as stationX(0) + OUTPUT_OVERHANG + LAYOUT_MARGIN', () => {
      const layout = computeCatwalkLayout(singleConfig);

      expect(layout.platformWidth).toBe(layout.stationX(0) + OUTPUT_OVERHANG + LAYOUT_MARGIN);
    });

    it('centers the single agent on stationX(0)', () => {
      const layout = computeCatwalkLayout(singleConfig);

      expect(layout.agentPosition(0, 0, 1).x).toBe(layout.stationX(0));
    });
  });

  describe('15. determinism', () => {
    it('produces identical results for identical inputs', () => {
      const layout1 = computeCatwalkLayout(defaultConfig);
      const layout2 = computeCatwalkLayout(defaultConfig);

      expect(layout1.platformWidth).toBe(layout2.platformWidth);
      expect(layout1.bounds).toEqual(layout2.bounds);
      expect(layout1.railEndpoints()).toEqual(layout2.railEndpoints());
      expect(layout1.groundEndpoints()).toEqual(layout2.groundEndpoints());

      for (let i = 0; i < defaultStations.length; i++) {
        expect(layout1.stationX(i)).toBe(layout2.stationX(i));
        expect(layout1.orchestratorPosition(i)).toEqual(layout2.orchestratorPosition(i));
      }

      expect(layout1.agentPosition(3, 0, 4)).toEqual(layout2.agentPosition(3, 0, 4));
      expect(layout1.chuteEndpoints(3, 0, 4)).toEqual(layout2.chuteEndpoints(3, 0, 4));
      expect(layout1.gatePosition(0, 1)).toEqual(layout2.gatePosition(0, 1));
    });
  });

  describe('16. range errors', () => {
    it('throws RangeError for stationX(-1)', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(() => layout.stationX(-1)).toThrow(RangeError);
    });

    it('throws RangeError for stationX(stations.length)', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(() => layout.stationX(defaultStations.length)).toThrow(RangeError);
    });

    it('throws RangeError for empty stations array', () => {
      expect(() => computeCatwalkLayout({ stations: [] })).toThrow(RangeError);
    });
  });

  describe('17. gatePosition between absent and visible station in compact mode', () => {
    const compactConfig: CatwalkLayoutConfig = {
      stations: [{ agentCount: 1, absent: true }, { agentCount: 1 }, { agentCount: 1 }],
      compact: true,
    };

    it('returns the midpoint using the off-screen ABSENT_X for the absent station', () => {
      const layout = computeCatwalkLayout(compactConfig);
      const absentStationX = layout.stationX(0);
      const visibleStationX = layout.stationX(1);
      const gate = layout.gatePosition(0, 1);

      expect(absentStationX).toBe(ABSENT_X);
      expect(gate.x).toBe((absentStationX + visibleStationX) / 2);
    });
  });

  describe('18. output artifact positions', () => {
    it('centers output artifacts below the producing agent', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const agentPos = layout.agentPosition(2, 0, 1);
      const artPos = layout.outputArtifactPosition(2, 0, 1, 0);

      expect(artPos.x).toBe(agentPos.x);
    });

    it('stacks output artifacts vertically with correct spacing', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const first = layout.outputArtifactPosition(0, 0, 1, 0);
      const second = layout.outputArtifactPosition(0, 0, 1, 1);

      expect(first.y).toBe(GROUND_LINE_Y + ARTIFACT_TOP_MARGIN + ART_H / 2);
      expect(second.y - first.y).toBe(ART_H + ARTIFACT_Y_GAP);
    });

    it('uses independent x for each agent at a multi-agent station', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const art0 = layout.outputArtifactPosition(3, 0, 4, 0);
      const art1 = layout.outputArtifactPosition(3, 1, 4, 0);

      expect(art0.x).not.toBe(art1.x);
      expect(art0.x).toBe(layout.agentPosition(3, 0, 4).x);
      expect(art1.x).toBe(layout.agentPosition(3, 1, 4).x);
    });
  });

  describe('19. input artifact positions', () => {
    it('places input artifacts to the left of the divider', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const divider = layout.dividerPosition(2, 1);
      const inputPos = layout.inputArtifactPosition(2, 1, 0);

      expect(inputPos.x).toBeLessThan(divider.x);
    });

    it('stacks input artifacts with the same spacing as output artifacts', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const first = layout.inputArtifactPosition(2, 1, 0);
      const second = layout.inputArtifactPosition(2, 1, 1);

      expect(second.y - first.y).toBe(ART_H + ARTIFACT_Y_GAP);
    });

    it('has the same first-artifact y as output artifacts', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const output = layout.outputArtifactPosition(2, 0, 1, 0);
      const input = layout.inputArtifactPosition(2, 1, 0);

      expect(input.y).toBe(output.y);
    });
  });

  describe('20. divider position', () => {
    it('places the divider to the left of the leftmost agent', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const leftmostAgent = layout.agentPosition(3, 0, 4);
      const divider = layout.dividerPosition(3, 4);

      expect(divider.x).toBe(leftmostAgent.x - DIVIDER_LEFT_OF_AGENT);
    });

    it('starts at GROUND_LINE_Y', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const divider = layout.dividerPosition(0, 1);

      expect(divider.y1).toBe(GROUND_LINE_Y);
    });

    it('extends to GROUND_LINE_Y + DIVIDER_FIXED_DEPTH', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const divider = layout.dividerPosition(0, 1);

      expect(divider.y2).toBe(GROUND_LINE_Y + DIVIDER_FIXED_DEPTH);
    });

    it('is between input and output zones', () => {
      const layout = computeCatwalkLayout(defaultConfig);
      const divider = layout.dividerPosition(2, 1);
      const inputPos = layout.inputArtifactPosition(2, 1, 0);
      const outputPos = layout.outputArtifactPosition(2, 0, 1, 0);

      expect(divider.x).toBeGreaterThan(inputPos.x);
      expect(divider.x).toBeLessThan(outputPos.x);
    });
  });

  describe('21. station label position', () => {
    it('has x equal to stationX', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.stationLabelPosition(0).x).toBe(layout.stationX(0));
    });

    it('has y equal to GROUND_LINE_Y + STATION_LABEL_BELOW_GROUND', () => {
      const layout = computeCatwalkLayout(defaultConfig);

      expect(layout.stationLabelPosition(0).y).toBe(GROUND_LINE_Y + STATION_LABEL_BELOW_GROUND);
    });
  });

  describe('22. integration: realistic multi-station multi-agent config', () => {
    const realisticConfig: CatwalkLayoutConfig = {
      stations: [
        { agentCount: 1, outputCountByAgent: [1], inputCount: 0 },
        { agentCount: 1, outputCountByAgent: [1], inputCount: 1 },
        { agentCount: 1, outputCountByAgent: [1], inputCount: 1 },
        { agentCount: 3, outputCountByAgent: [1, 1, 1], inputCount: 1 },
        { agentCount: 1, outputCountByAgent: [1], inputCount: 1 },
        { agentCount: 1, outputCountByAgent: [1], inputCount: 1 },
        { agentCount: 0, inputCount: 3 },
      ],
    };

    it('places all agents at y = GROUND_LINE_Y', () => {
      const layout = computeCatwalkLayout(realisticConfig);

      for (let s = 0; s < 6; s++) {
        const station = realisticConfig.stations[s];
        if (station === undefined) continue;
        for (let a = 0; a < station.agentCount; a++) {
          expect(layout.agentPosition(s, a, station.agentCount).y).toBe(GROUND_LINE_Y);
        }
      }
    });

    it('places all orchestrator positions at y = RAIL_Y', () => {
      const layout = computeCatwalkLayout(realisticConfig);

      for (let s = 0; s < 7; s++) {
        expect(layout.orchestratorPosition(s).y).toBe(RAIL_Y);
      }
    });

    it('aligns each agent output column x with that agent x', () => {
      const layout = computeCatwalkLayout(realisticConfig);

      // Review station (3 agents)
      for (let a = 0; a < 3; a++) {
        const agentPos = layout.agentPosition(3, a, 3);
        const artPos = layout.outputArtifactPosition(3, a, 3, 0);
        expect(artPos.x).toBe(agentPos.x);
      }
    });

    it('has each agent at multi-agent station with independent x', () => {
      const layout = computeCatwalkLayout(realisticConfig);

      const xs = [0, 1, 2].map((a) => layout.agentPosition(3, a, 3).x);
      expect(new Set(xs).size).toBe(3);
    });

    it('places all input artifacts to the left of their station divider', () => {
      const layout = computeCatwalkLayout(realisticConfig);

      for (let s = 1; s < 7; s++) {
        const station = realisticConfig.stations[s];
        if (station === undefined) continue;
        const agentCount = Math.max(station.agentCount, 1);
        const divider = layout.dividerPosition(s, agentCount);
        const inputPos = layout.inputArtifactPosition(s, agentCount, 0);
        expect(inputPos.x).toBeLessThan(divider.x);
      }
    });

    it('has symmetric rail extents past first and last visible station', () => {
      const layout = computeCatwalkLayout(realisticConfig);
      const rail = layout.railEndpoints();

      expect(rail.x1).toBe(layout.stationX(0) - RAIL_OVERSHOOT);
      expect(rail.x2).toBe(layout.stationX(6) + RAIL_OVERSHOOT);
    });
  });
});
