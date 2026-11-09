// How much of a section of actions a card shows; the inspector lists the rest. The layout's size estimate reads the same
// limits, so a clamped card is never taller than the room reserved for it.

/** The number of actions that a card shows per section, before a line that counts the rest. */
export const MAX_CARD_ACTIONS = 2;

/** The number of lines to which a card clamps each action. */
export const MAX_ACTION_LINES = 2;

/** The width at which a flow's preamble of ambient instructions wraps; its flow is never narrower. */
export const PREAMBLE_WIDTH = 480;

/** The number of lines to which a preamble clamps each ambient instruction. */
export const MAX_AMBIENT_LINES = 2;
