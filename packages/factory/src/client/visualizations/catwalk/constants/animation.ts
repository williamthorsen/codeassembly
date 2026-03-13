// --- Agent state opacities ---

/** Opacity for idle agents and absent station labels. */
export const IDLE_OPACITY = 0.3;

/** Opacity for resting agents between active phases. */
export const RESTING_OPACITY = 0.6;

/** Opacity for active agents (working, walking, celebrating, concerned) and present station labels. */
export const ACTIVE_OPACITY = 1;

/** Opacity for agents that have completed their role and are no longer active. */
export const DEACTIVATED_OPACITY = 0.15;

// --- Orchestrator opacities ---

/** Orchestrator opacity when not working. */
export const ORCH_IDLE_OPACITY = 0.8;

/** Orchestrator opacity when waiting for user input. */
export const ORCH_WAITING_OPACITY = 0.6;

// --- Scene element opacities ---

/** Gate barrier opacity. */
export const GATE_OPACITY = 0.85;

/** Chute connection opacity when active. */
export const CHUTE_OPACITY = 0.5;

/** Chute connection opacity when its station is inactive. */
export const CHUTE_DIMMED_OPACITY = 0.15;

// --- Scale pulse ---

/** Minimum scale for all actors during working pulse (resting baseline). */
export const SCALE_PULSE_MIN = 1;

/** Maximum scale for all actors during working pulse. */
export const SCALE_PULSE_MAX = 1.08;

/** Pulse oscillation frequency in cycles per second. */
export const PULSE_FREQUENCY = 1.5;
