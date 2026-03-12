import type { BodyPart, Pose } from './svg-renderer.ts';

// ── Body parts ──────────────────────────────────────────────────────────────
// Target: ~30px total height, bottom-aligned with treads at row 26.
// Layout (top to bottom): Beacon rows 1-2, Head rows 3-10, Torso rows 11-24, Treads rows 26-29.
// Part composition order per pose (painter's algorithm): treads, torso, arms, head, beacon.

// 3×2 beacon lamp (on — bright)
const BEACON_ON: BodyPart = {
  pixels: [
    [6, 6, 6],
    [5, 4, 5],
  ],
  offsetX: 14,
  offsetY: 1,
};

// 3×2 beacon lamp (off — dark)
const BEACON_OFF: BodyPart = {
  pixels: [
    [3, 2, 3],
    [2, 1, 2],
  ],
  offsetX: 14,
  offsetY: 1,
};

// 3×2 beacon lamp (idle — very dim)
const BEACON_IDLE: BodyPart = {
  pixels: [
    [2, 1, 2],
    [1, 1, 1],
  ],
  offsetX: 14,
  offsetY: 1,
};

// 12×8 wider head with visor strip
const HEAD: BodyPart = {
  pixels: [
    [5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 1], // visor row
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 1], // visor row
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 10,
  offsetY: 3,
};

// Head shifted 1px down (slouching/concerned pose)
const HEAD_SLOUCH: BodyPart = {
  ...HEAD,
  offsetY: HEAD.offsetY + 1,
};

// Head with dimmed visor (index 3 instead of 5)
const HEAD_VISOR_DIM: BodyPart = {
  pixels: [
    [5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1], // dimmed visor
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1], // dimmed visor
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 10,
  offsetY: 3,
};

// Head with bright visor (index 6 instead of 5)
const HEAD_VISOR_BRIGHT: BodyPart = {
  pixels: [
    [5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 1], // bright visor
    [5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 1], // bright visor
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 10,
  offsetY: 3,
};

// 16×14 broader torso with shading
const TORSO: BodyPart = {
  pixels: [
    [5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 4, 4, 5, 5, 5, 5, 5, 4, 4, 3, 3, 2, 1], // chest panel band
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 8,
  offsetY: 11,
};

// 18×4 tank treads frame A
const TREADS_A: BodyPart = {
  pixels: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 1], // alternating pattern
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 7,
  offsetY: 26,
};

// 18×4 tank treads frame B — row 2 shifted one position
const TREADS_B: BodyPart = {
  pixels: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1], // shifted pattern
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 7,
  offsetY: 26,
};

// 2×8 arm at side (left)
const ARM_LEFT: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 6,
  offsetY: 12,
};

// 2×8 arm at side (right)
const ARM_RIGHT: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 24,
  offsetY: 12,
};

// Shift a body part 1px upward (used for vibration animation)
function vibrate(part: BodyPart): BodyPart {
  return { ...part, offsetY: part.offsetY - 1 };
}

// ── 12 poses in sprite-sheet order ──────────────────────────────────────────

/** Twelve animation poses for the orchestrator robot, ordered by sprite-sheet frame index. */
export const ORCHESTRATOR_POSES: Pose[] = [
  // Frame 0: Idle 1 — beacon dim, visor normal, treads A
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD, BEACON_OFF],

  // Frame 1: Idle 2 — beacon dim, visor dimmed, treads A
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD_VISOR_DIM, BEACON_OFF],

  // Frame 2: Concerned — head slouched, beacon dim
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD_SLOUCH, BEACON_OFF],

  // Frame 3: (spare)
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD, BEACON_OFF],

  // Frame 4: Working 1 — beacon on, body at normal Y
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD, BEACON_ON],

  // Frame 5: Working 2 — beacon off, upper body Y-1 (vibrate)
  [TREADS_A, vibrate(TORSO), vibrate(ARM_LEFT), vibrate(ARM_RIGHT), vibrate(HEAD), vibrate(BEACON_OFF)],

  // Frame 6: Walking 1 — beacon on, treads A
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD, BEACON_ON],

  // Frame 7: Walking 2 — beacon off, treads B
  [TREADS_B, TORSO, ARM_LEFT, ARM_RIGHT, HEAD, BEACON_OFF],

  // Frame 8: Celebrating 1 — beacon on, visor bright, treads A, normal Y
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD_VISOR_BRIGHT, BEACON_ON],

  // Frame 9: Celebrating 2 — beacon on, visor normal, treads B, upper body Y-1
  [TREADS_B, vibrate(TORSO), vibrate(ARM_LEFT), vibrate(ARM_RIGHT), vibrate(HEAD), vibrate(BEACON_ON)],

  // Frame 10: (spare)
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD, BEACON_OFF],

  // Frame 11: (spare)
  [TREADS_A, TORSO, ARM_LEFT, ARM_RIGHT, HEAD, BEACON_OFF],
];
