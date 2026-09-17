import type { AliasMap } from '@williamthorsen/kb';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { canonicalize } from '@williamthorsen/kb/tags';

import { dedupeInOrder, formatUtcTimestamp } from '../kb-shared/note-helpers.ts';
import type { PreparedNote, WriteArgs } from './types.ts';

/**
 * Composes a born-verified assertion record from parsed CLI args, stamping `created`, `updated`, and `lastVerified`
 * from one second-precision UTC instant. `recordType` is fixed at `'assertion'`, because `kb-add` writes nothing else.
 */
export function prepareNote(input: { args: WriteArgs; aliases: AliasMap; now: Date; body: string }): PreparedNote {
  const { args, aliases, now, body } = input;

  const originalTags = [...args.tags];
  // Canonicalization can collapse distinct inputs (`node.js`, `node`) onto the same canonical (`nodejs`). Keep the
  // original list intact for the audit trail and deduplicate the written tag list in first-occurrence order so the
  // note doesn't ship `['nodejs', 'nodejs']`.
  const canonicalTags = dedupeInOrder(originalTags.map((tag) => canonicalize(tag, aliases)));
  const today = formatUtcTimestamp(now);

  const extra: Record<string, unknown> = {};
  if (args.diataxis !== null) {
    extra.diataxis = args.diataxis;
  }

  const record: KbAssertion = {
    recordType: 'assertion',
    title: args.title,
    created: today,
    updated: today,
    tags: canonicalTags,
    addressedBy: [],
    lastVerified: today,
    extra,
    body,
  };

  return { record, originalTags, canonicalTags };
}
