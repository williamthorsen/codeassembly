/**
 * The typed error thrown by the KB loaders (`loadKbConfig`, `loadSchema`, `loadAliases`) on a structural defect:
 * malformed YAML, a schema violation, or an illegal override. The `kind` discriminant lets a caller distinguish a
 * recoverable config/schema/alias defect from any other throw (an enumeration or rule crash) without matching on
 * message text or relying on `instanceof` surviving a bundle boundary.
 */
export class KbLoaderError extends Error {
  /** Discriminant for narrow catch boundaries; survives serialization and bundling unlike `instanceof`. */
  readonly kind = 'KbLoaderError' as const;

  constructor(message: string) {
    super(message);
    this.name = 'KbLoaderError';
  }
}

/** Type guard narrowing an unknown throw to a {@link KbLoaderError} via its `kind` discriminant. */
export function isKbLoaderError(error: unknown): error is KbLoaderError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate: { kind?: unknown } = error;
  return candidate.kind === 'KbLoaderError';
}
