/**
 * The reserved destination value that selects the registry's `default_kb`. The capture-event (`--store`) and kb-add
 * (`--kb`) resolvers share it, so the two tools use one spelling of the sentinel.
 */
export const DEFAULT_KB_SENTINEL = '@default';

/** The reserved `--store` value that selects the registry's `feedback_kb`. */
export const FEEDBACK_KB_SENTINEL = '@feedback';
