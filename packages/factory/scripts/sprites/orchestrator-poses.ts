import type { BodyPart, Pose } from './svg-renderer.ts';

// ── Body parts ──────────────────────────────────────────────────────────────
// Target: ~28px total height (88% of 32), bottom-aligned with feet at row ~30.
// Layout (top to bottom): Antenna rows 2-4, Head rows 5-12, Torso rows 13-23, Legs rows 24-30.

// 1x3 antenna above head center
const ANTENNA: BodyPart = {
  pixels: [[5], [4], [3]],
  offsetX: 15,
  offsetY: 2,
};

// 12x8 wider head with visor strip
const HEAD: BodyPart = {
  pixels: [
    [5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 1],
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 10,
  offsetY: 5,
};

// 14x11 broader torso with shading
const TORSO: BodyPart = {
  pixels: [
    [5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 4, 4, 5, 5, 5, 4, 4, 3, 3, 2, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 9,
  offsetY: 13,
};

// 2x7 arm hanging at side (left)
const ARM_LEFT_DOWN: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 7,
  offsetY: 14,
};

// 2x7 arm hanging at side (right)
const ARM_RIGHT_DOWN: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 23,
  offsetY: 14,
};

// 2x7 arm raised partway (left)
const ARM_LEFT_UP: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 7,
  offsetY: 9,
};

// 2x7 arm raised partway (right)
const ARM_RIGHT_UP: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 23,
  offsetY: 9,
};

// 2x7 arm raised high (left, for celebrating)
const ARM_LEFT_RAISED_HIGH: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 7,
  offsetY: 4,
};

// 2x7 arm raised high (right, for celebrating)
const ARM_RIGHT_RAISED_HIGH: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 23,
  offsetY: 4,
};

// 2x7 arm raised high and splayed out (left, for V-shape celebrating)
const ARM_LEFT_SPLAYED: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 5,
  offsetY: 4,
};

// 2x7 arm raised high and splayed out (right, for V-shape celebrating)
const ARM_RIGHT_SPLAYED: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 25,
  offsetY: 4,
};

// 7x2 arm extended horizontally (left)
const ARM_LEFT_EXTENDED: BodyPart = {
  pixels: [
    [4, 3, 3, 3, 3, 3, 1],
    [1, 2, 2, 2, 2, 2, 1],
  ],
  offsetX: 2,
  offsetY: 15,
};

// 7x2 arm extended horizontally (right)
const ARM_RIGHT_EXTENDED: BodyPart = {
  pixels: [
    [1, 3, 3, 3, 3, 3, 4],
    [1, 2, 2, 2, 2, 2, 1],
  ],
  offsetX: 23,
  offsetY: 15,
};

// Legs standing straight (pair), wider stance for orchestrator
const LEG_STAND: BodyPart = {
  pixels: [
    [0, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0],
    [0, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0],
    [0, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0],
    [0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0],
    [0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0],
    [0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0],
    [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1],
  ],
  offsetX: 10,
  offsetY: 24,
};

// Legs with left leg forward, right leg back (walking mid-stride)
const LEG_FORWARD: BodyPart = {
  pixels: [
    [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0],
    [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0],
    [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0],
    [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0],
    [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
  ],
  offsetX: 9,
  offsetY: 24,
};

// Legs with slight outward splay (for resting)
const LEG_RELAXED: BodyPart = {
  pixels: [
    [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0],
    [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0],
    [3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3],
    [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2],
    [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2],
    [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1],
  ],
  offsetX: 10,
  offsetY: 24,
};

// Arms pulled in close (for concerned)
const ARM_LEFT_PULLED_IN: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 8,
  offsetY: 15,
};

const ARM_RIGHT_PULLED_IN: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 22,
  offsetY: 15,
};

// Head shifted down 1px (for slouching/resting)
const HEAD_SLOUCH: BodyPart = {
  ...HEAD,
  offsetY: HEAD.offsetY + 1,
};

// Antenna shifted down 1px to match slouch
const ANTENNA_SLOUCH: BodyPart = {
  ...ANTENNA,
  offsetY: ANTENNA.offsetY + 1,
};

// ── 12 poses in sprite-sheet order ──────────────────────────────────────────

/** Twelve animation poses for the orchestrator robot, ordered by sprite-sheet frame index. */
export const ORCHESTRATOR_POSES: Pose[] = [
  // Frame 0: Idle 1 — standing, arms down
  [LEG_STAND, TORSO, ARM_LEFT_DOWN, ARM_RIGHT_DOWN, HEAD, ANTENNA],

  // Frame 1: Idle 2 — arms shifted 1px (ping-pong variation)
  [
    LEG_STAND,
    TORSO,
    { ...ARM_LEFT_DOWN, offsetX: ARM_LEFT_DOWN.offsetX - 1 },
    { ...ARM_RIGHT_DOWN, offsetX: ARM_RIGHT_DOWN.offsetX + 1 },
    HEAD,
    ANTENNA,
  ],

  // Frame 2: Walking — mid-stride with LEG_FORWARD
  [LEG_FORWARD, TORSO, ARM_LEFT_UP, ARM_RIGHT_DOWN, HEAD, ANTENNA],

  // Frame 3: Resting 1 — relaxed stance
  [LEG_RELAXED, TORSO, ARM_LEFT_DOWN, ARM_RIGHT_DOWN, HEAD, ANTENNA],

  // Frame 4: Working 1 — both arms raised
  [LEG_STAND, TORSO, ARM_LEFT_UP, ARM_RIGHT_UP, HEAD, ANTENNA],

  // Frame 5: Working 2 — arms extended horizontally
  [LEG_STAND, TORSO, ARM_LEFT_EXTENDED, ARM_RIGHT_EXTENDED, HEAD, ANTENNA],

  // Frame 6: Working 3 — arms lowering back (one up, one down)
  [LEG_STAND, TORSO, ARM_LEFT_UP, ARM_RIGHT_DOWN, HEAD, ANTENNA],

  // Frame 7: Resting 2 — slight slouch, head offset 1px down
  [LEG_RELAXED, TORSO, ARM_LEFT_DOWN, ARM_RIGHT_DOWN, HEAD_SLOUCH, ANTENNA_SLOUCH],

  // Frame 8: Celebrating 1 — both arms raised high
  [LEG_STAND, TORSO, ARM_LEFT_RAISED_HIGH, ARM_RIGHT_RAISED_HIGH, HEAD, ANTENNA],

  // Frame 9: Celebrating 2 — arms in V-shape (splayed)
  [LEG_STAND, TORSO, ARM_LEFT_SPLAYED, ARM_RIGHT_SPLAYED, HEAD, ANTENNA],

  // Frame 10: Concerned — hunched, arms pulled in
  [LEG_STAND, TORSO, ARM_LEFT_PULLED_IN, ARM_RIGHT_PULLED_IN, HEAD_SLOUCH, ANTENNA_SLOUCH],

  // Frame 11: Resting 3 — powered-down, arms at sides
  [LEG_RELAXED, TORSO, ARM_LEFT_DOWN, ARM_RIGHT_DOWN, HEAD, ANTENNA],
];
