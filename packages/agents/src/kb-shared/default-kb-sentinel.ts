/**
 * The reserved destination value that deliberately selects the registry's `default_kb` instead of a named knowledge
 * base. Shared across the capture-event (`--store`) and kb-add (`--kb`) resolvers so the two tools advertise one
 * sentinel and cannot drift.
 */
export const DEFAULT_KB_SENTINEL = '@default';
