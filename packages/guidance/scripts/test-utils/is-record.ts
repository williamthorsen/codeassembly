/**
 * Type guard: Narrows `value` to a plain object with unknown property values.
 *
 * Kept local rather than imported from `src/lib/type-guards.ts`: These smoke-test utilities are outside the runtime
 * surface, and importing runtime source here would couple the two for the sake of a one-line guard.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
