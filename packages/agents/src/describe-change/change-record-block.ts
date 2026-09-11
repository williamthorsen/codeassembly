import { stringify as stringifyYaml } from 'yaml';

import { normalizeChangeRecord } from '../change-grammar/tokens.ts';
import type { ChangeRecord } from '../change-grammar/types.ts';

/**
 * Renders the fenced `change-record` block a pull-request body carries as its final block: the head the branch
 * consolidated to, the commit that head was derived from, and any override the author applied.
 *
 * The payload is YAML rather than a surface template, because `head` and `overrides` nest and a template renders one
 * flat line. Its inverse is a YAML parse rather than a compiled pattern, so the pair needs no round-trip verification
 * of the kind the title grammar requires.
 *
 * `head` and `overrides` are normalized as the engine normalizes any record, so a field the branch did not determine is
 * absent rather than empty, a marker spelled on a type splits into the type and `breaking`, and `breaking` appears only
 * where it is true.
 */
export function renderChangeRecordBlock(block: ChangeRecordBlock): string {
  const overrides = normalizeOverrides(block.overrides ?? {});
  const payload = {
    commit: block.commit,
    head: normalizeChangeRecord(block.head),
    ...(Object.keys(overrides).length > 0 && { overrides }),
  };
  return `${FENCE}${INFO_STRING}\n${stringifyYaml(payload)}${FENCE}`;
}

/** What the block records: the derived head, the commit it was derived from, and the overrides the author applied. */
export interface ChangeRecordBlock {
  commit: string;
  head: ChangeRecord;
  overrides?: RecordOverrides;
}

/**
 * The dimensions an author may override, named as the flags that set them are. `breaking` is only ever `true`: an
 * override can add the marker to a head but not remove it.
 */
export interface RecordOverrides {
  breaking?: true;
  scope?: string;
  type?: string;
}

// region | Helpers

/** Opens and closes the block. */
const FENCE = '```';

/** Names the block's kind on the opening fence, distinguishing it from any other fence in the body. */
const INFO_STRING = 'change-record';

/** Keeps only the overridable dimensions of a normalized record, so a marker spelled on the type becomes `breaking`. */
function normalizeOverrides(overrides: RecordOverrides): RecordOverrides {
  const { breaking, scope, type } = normalizeChangeRecord(overrides);
  return {
    ...(scope !== undefined && { scope }),
    ...(type !== undefined && { type }),
    ...(breaking === true && { breaking }),
  };
}

// endregion | Helpers
