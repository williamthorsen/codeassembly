// -- Animation constants --
// Centralized timing, speed, opacity, and scale values for office transitions.
// Tweak values here to adjust the feel of all office animations.

/** Walk speed in pixels per second (~3.5 tiles/sec at 32px/tile). */
export const WALK_SPEED_PX_PER_SEC = 112;

/** Duration for fade-in and fade-out transitions in milliseconds. */
export const FADE_DURATION_MS = 300;

/** Target opacity during the dim phase of a state-change pulse. */
export const STATE_CHANGE_PULSE_OPACITY = 0.5;

/** Duration of each half of a state-change pulse (dim then restore) in milliseconds. */
export const STATE_CHANGE_PULSE_HALF_MS = 250;

/** Overshoot scale for the artifact-appear bounce effect. */
export const ARTIFACT_OVERSHOOT_SCALE = 1.2;

/** Duration of each phase of the artifact-appear animation (overshoot, settle) in milliseconds. */
export const ARTIFACT_APPEAR_PHASE_MS = 200;

/** Speed for computing `scaleTo` velocity during artifact-appear (scale units per second). */
export const ARTIFACT_APPEAR_SCALE_SPEED = ARTIFACT_OVERSHOOT_SCALE / (ARTIFACT_APPEAR_PHASE_MS / 1000);

/** Movement speed for artifact delivery in pixels per second. */
export const ARTIFACT_DELIVER_SPEED_PX_PER_SEC = 160;
