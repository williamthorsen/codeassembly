/**
 * The typed error thrown by the loaders and writers of a KB's YAML files on a structural defect, such as malformed YAML
 * or wrong types. The `kind` discriminant lets a caller distinguish a recoverable defect in such a file from any other
 * throw (an enumeration or detection crash) without matching on message text or relying on `instanceof` surviving a
 * bundle boundary.
 */
export class KbLoaderError extends Error {
  readonly kind = 'KbLoaderError' as const;

  /** Names the error after its class. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
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
