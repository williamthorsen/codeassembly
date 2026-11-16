import type { ConversionState, EndedConversionState } from '../conversion-protocol/conversion-schemas.ts';

/**
 * Where the conversion handler keeps each conversion's state. An ended state is written only over a running one, so
 * that a cancel, a timeout, and a run's own end cannot overwrite each other.
 */
export interface ConversionStore {
  /** Adds a conversion, whose id is new. */
  create(state: ConversionState): Promise<void>;
  /** Returns the conversion's state, or `undefined` when the store does not have it. */
  read(id: string): Promise<ConversionState | undefined>;
  /** Replaces the conversion's state with the ended one only when it is `running`, and reports whether it did. */
  finish(id: string, ended: EndedConversionState): Promise<boolean>;
}
