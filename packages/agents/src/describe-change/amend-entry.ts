import type { Taxonomy } from '../change-grammar/types.ts';
import type { ChangeEntry } from './change-entries.ts';
import { readChangeRecordBlock, renderChangeRecordBlock, replaceLastChangeRecordBlock } from './change-record-block.ts';
import { findDefects, type RecordDefect } from './find-defects.ts';

/**
 * Amends one change entry in a pull-request body's last `change-record` block, returning the body with that block
 * re-rendered and every other byte unchanged.
 *
 * The block keeps its title, overrides, and derivation commit. Refuses a block that is absent or malformed, malformed
 * entries, an index out of range, and an amendment that leaves the entry's type undeclared or its marker in breach of
 * the type's policy, so an amendment that returns always clears the entry's defect.
 */
export function amendEntry(input: {
  amendment: EntryAmendment;
  body: string;
  index: number;
  taxonomy: Taxonomy;
}): AmendedEntry {
  const reading = readChangeRecordBlock(input.body);
  if (reading.kind === 'absent') {
    throw new Error('the body contains no change-record block');
  }
  if (reading.kind === 'malformed') {
    throw new Error(`the body’s change-record block is malformed: ${reading.defect}`);
  }
  if (reading.entriesDefect !== undefined) {
    throw new Error(`the block’s change entries are malformed: ${reading.entriesDefect}`);
  }

  const entries = reading.block.entries ?? [];
  const current = entries[input.index];
  if (current === undefined) {
    throw new Error(`entry ${input.index} is out of range; the block records ${entries.length} change entries`);
  }
  const { breaking, type } = input.amendment;
  const entry: ChangeEntry = {
    ...current,
    ...(breaking !== undefined && { breaking }),
    ...(type !== undefined && { type }),
  };
  const [defect] = findDefects(entry, input.taxonomy);
  if (defect !== undefined) {
    throw new Error(`the amendment leaves entries[${input.index}] defective: ${describeDefect(defect)}`);
  }

  const amended = entries.with(input.index, entry);
  const block = renderChangeRecordBlock({
    ...reading.block,
    entries: amended,
  });
  return { body: replaceLastChangeRecordBlock(input.body, block), entry, entryCount: amended.length };
}

/** The amended body, the entry as amended, and the number of entries that the block records. */
export interface AmendedEntry {
  body: string;
  entry: ChangeEntry;
  entryCount: number;
}

/** The fields of a change entry that an amendment sets; a field left out keeps the entry's value. */
export interface EntryAmendment {
  breaking?: boolean;
  type?: string;
}

// region | Helpers

/** Describes a defect that an amended entry would keep. */
function describeDefect(defect: RecordDefect): string {
  switch (defect.kind) {
    case 'missing-type':
      return 'it names no type';
    case 'policy-violation':
      return `the type ${defect.type} forbids the breaking marker`;
    case 'undeclared-type':
      return `the taxonomy does not declare the type ${defect.type}`;
  }
}

// endregion | Helpers
