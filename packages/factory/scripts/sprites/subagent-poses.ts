import type { BodyPart, Pose } from './svg-renderer.ts';

// ── Body parts ──────────────────────────────────────────────────────────────
// Target: ~24px total height (75% of 32), bottom-aligned with feet at row ~30.
// Layout (top to bottom): Head rows 7-14, Torso rows 15-24, Legs rows 25-30.

// 10x8 boxy head with 2-pixel visor strip
const HEAD: BodyPart = {
  pixels: [
    [5, 5, 4, 4, 4, 4, 4, 4, 3, 3],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 1],
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 11,
  offsetY: 7,
};

// 12x10 rectangular torso with shadow on bottom/right edges
const TORSO: BodyPart = {
  pixels: [
    [5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 3, 3, 4, 4, 4, 4, 4, 3, 3, 2, 1],
    [5, 3, 3, 4, 4, 4, 4, 4, 3, 3, 2, 1],
    [5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  offsetX: 10,
  offsetY: 15,
};

// 2x6 arm hanging at side (left)
const ARM_LEFT_DOWN: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 8,
  offsetY: 16,
};

// 2x6 arm hanging at side (right)
const ARM_RIGHT_DOWN: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 22,
  offsetY: 16,
};

// 2x6 arm raised partway (left)
const ARM_LEFT_UP: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 8,
  offsetY: 12,
};

// 2x6 arm raised partway (right)
const ARM_RIGHT_UP: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 22,
  offsetY: 12,
};

// 2x6 arm raised high (left, for celebrating)
const ARM_LEFT_RAISED_HIGH: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 8,
  offsetY: 8,
};

// 2x6 arm raised high (right, for celebrating)
const ARM_RIGHT_RAISED_HIGH: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 22,
  offsetY: 8,
};

// 2x6 arm raised high and splayed out (left, for V-shape celebrating)
const ARM_LEFT_SPLAYED: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 6,
  offsetY: 8,
};

// 2x6 arm raised high and splayed out (right, for V-shape celebrating)
const ARM_RIGHT_SPLAYED: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 24,
  offsetY: 8,
};

// 6x2 arm extended horizontally (left)
const ARM_LEFT_EXTENDED: BodyPart = {
  pixels: [
    [4, 3, 3, 3, 3, 1],
    [1, 2, 2, 2, 2, 1],
  ],
  offsetX: 4,
  offsetY: 17,
};

// 6x2 arm extended horizontally (right)
const ARM_RIGHT_EXTENDED: BodyPart = {
  pixels: [
    [1, 3, 3, 3, 3, 4],
    [1, 2, 2, 2, 2, 1],
  ],
  offsetX: 22,
  offsetY: 17,
};

// 9x6 legs standing straight (pair)
const LEG_STAND: BodyPart = {
  pixels: [
    [0, 3, 0, 0, 0, 0, 0, 3, 0],
    [0, 3, 0, 0, 0, 0, 0, 3, 0],
    [0, 3, 0, 0, 0, 0, 0, 3, 0],
    [0, 2, 0, 0, 0, 0, 0, 2, 0],
    [0, 2, 0, 0, 0, 0, 0, 2, 0],
    [1, 1, 1, 0, 0, 0, 1, 1, 1],
  ],
  offsetX: 11,
  offsetY: 25,
};

// Legs with left leg forward, right leg back (walking mid-stride)
const LEG_FORWARD: BodyPart = {
  pixels: [
    [0, 3, 0, 0, 0, 0, 0, 0, 3],
    [0, 3, 0, 0, 0, 0, 0, 0, 3],
    [3, 2, 0, 0, 0, 0, 0, 0, 2],
    [2, 2, 0, 0, 0, 0, 0, 0, 2],
    [1, 1, 0, 0, 0, 0, 0, 0, 2],
    [0, 0, 0, 0, 0, 0, 0, 1, 1],
  ],
  offsetX: 10,
  offsetY: 25,
};

// Legs with slight outward splay (for resting)
const LEG_RELAXED: BodyPart = {
  pixels: [
    [3, 0, 0, 0, 0, 0, 0, 0, 3],
    [3, 0, 0, 0, 0, 0, 0, 0, 3],
    [3, 0, 0, 0, 0, 0, 0, 0, 3],
    [2, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 0, 0, 0, 0, 0, 0, 0, 2],
    [1, 1, 0, 0, 0, 0, 0, 1, 1],
  ],
  offsetX: 11,
  offsetY: 25,
};

// Arms pulled in close to body (for concerned)
const ARM_LEFT_PULLED_IN: BodyPart = {
  pixels: [
    [4, 3],
    [3, 2],
    [3, 2],
    [3, 2],
    [1, 1],
  ],
  offsetX: 9,
  offsetY: 17,
};

const ARM_RIGHT_PULLED_IN: BodyPart = {
  pixels: [
    [3, 4],
    [2, 3],
    [2, 3],
    [2, 3],
    [1, 1],
  ],
  offsetX: 21,
  offsetY: 17,
};

// Head shifted down 1px (for slouching/resting)
const HEAD_SLOUCH: BodyPart = {
  ...HEAD,
  offsetY: HEAD.offsetY + 1,
};

// ── 12 poses in sprite-sheet order ──────────────────────────────────────────

/** Twelve animation poses for the subagent robot, ordered by sprite-sheet frame index. */
export const SUBAGENT_POSES: Pose[] = [
  // Frame 0: Idle 1 — standing, arms down
  [LEG_STAND, TORSO, ARM_LEFT_DOWN, ARM_RIGHT_DOWN, HEAD],

  // Frame 1: Idle 2 — arms shifted 1px (ping-pong variation)
  [
    LEG_STAND,
    TORSO,
    { ...ARM_LEFT_DOWN, offsetX: ARM_LEFT_DOWN.offsetX - 1 },
    { ...ARM_RIGHT_DOWN, offsetX: ARM_RIGHT_DOWN.offsetX + 1 },
    HEAD,
  ],

  // Frame 2: Walking — mid-stride with LEG_FORWARD
  [LEG_FORWARD, TORSO, ARM_LEFT_UP, ARM_RIGHT_DOWN, HEAD],

  // Frame 3: Resting 1 — relaxed stance
  [LEG_RELAXED, TORSO, ARM_LEFT_DOWN, ARM_RIGHT_DOWN, HEAD],

  // Frame 4: Working 1 — both arms raised
  [LEG_STAND, TORSO, ARM_LEFT_UP, ARM_RIGHT_UP, HEAD],

  // Frame 5: Working 2 — arms extended horizontally
  [LEG_STAND, TORSO, ARM_LEFT_EXTENDED, ARM_RIGHT_EXTENDED, HEAD],

  // Frame 6: Working 3 — arms lowering back (one up, one down)
  [LEG_STAND, TORSO, ARM_LEFT_UP, ARM_RIGHT_DOWN, HEAD],

  // Frame 7: Resting 2 — slight slouch, head offset 1px down
  [LEG_RELAXED, TORSO, ARM_LEFT_DOWN, ARM_RIGHT_DOWN, HEAD_SLOUCH],

  // Frame 8: Celebrating 1 — both arms raised high
  [LEG_STAND, TORSO, ARM_LEFT_RAISED_HIGH, ARM_RIGHT_RAISED_HIGH, HEAD],

  // Frame 9: Celebrating 2 — arms in V-shape (splayed)
  [LEG_STAND, TORSO, ARM_LEFT_SPLAYED, ARM_RIGHT_SPLAYED, HEAD],

  // Frame 10: Concerned — hunched, arms pulled in
  [LEG_STAND, TORSO, ARM_LEFT_PULLED_IN, ARM_RIGHT_PULLED_IN, HEAD_SLOUCH],

  // Frame 11: Resting 3 — powered-down, arms at sides
  [LEG_RELAXED, TORSO, ARM_LEFT_DOWN, ARM_RIGHT_DOWN, HEAD],
];
