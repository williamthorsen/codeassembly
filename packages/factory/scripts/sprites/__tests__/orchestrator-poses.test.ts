import { describe, expect, it } from 'vitest';

import { ORCHESTRATOR_POSES } from '../orchestrator-poses.ts';

describe('ORCHESTRATOR_POSES', () => {
  it('exports exactly 12 poses', () => {
    expect(ORCHESTRATOR_POSES).toHaveLength(12);
  });

  it('every pixel index is within 0-6 (palette range including beacon bright)', () => {
    for (const [poseIndex, pose] of ORCHESTRATOR_POSES.entries()) {
      for (const [partIndex, part] of pose.entries()) {
        for (const [rowIndex, row] of part.pixels.entries()) {
          for (const [colIndex, value] of row.entries()) {
            expect(
              value,
              `pose ${poseIndex}, part ${partIndex}, row ${rowIndex}, col ${colIndex}: value ${value} out of range`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              value,
              `pose ${poseIndex}, part ${partIndex}, row ${rowIndex}, col ${colIndex}: value ${value} out of range`,
            ).toBeLessThanOrEqual(6);
          }
        }
      }
    }
  });

  it('every pose has treads at offsetY 26 (bottom-anchored)', () => {
    for (const [index, pose] of ORCHESTRATOR_POSES.entries()) {
      const treadPart = pose[0];
      expect(treadPart?.offsetY, `pose ${index} treads not at row 26`).toBe(26);
    }
  });

  it('beacon on frames use palette index 6', () => {
    // Frame 4 (Working 1) should have beacon with index 6 pixels
    const beaconPart = ORCHESTRATOR_POSES[4]?.[5]; // last part = beacon
    expect(beaconPart).toBeDefined();
    const hasIndex6 = beaconPart?.pixels.some((row) => row.includes(6)) ?? false;
    expect(hasIndex6).toBe(true);
  });
});
