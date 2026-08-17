import { extractSection } from '../lib/markdown-sections.ts';

// The body-section contract of a lede decision record. The writer that composes a decision and the reader that mines
// one share these headings and the tag that marks a decision out from the other events in the store, so neither side
// can rename a section without the other.

/** Heading of the section carrying the lede the agent published to the pull request. */
export const AGENT_LEDE_HEADING = 'Agent lede';

/** Heading of the section carrying the author's critique of the agent's lede. */
export const COMMENT_HEADING = 'Comment';

/** The tag every lede decision carries. */
export const LEDE_DECISION_TAG = 'lede-decision';

/** Heading of the section carrying the lede that reached the merge commit, written only when the two texts differ. */
export const MERGED_LEDE_HEADING = 'Merged lede';

/**
 * Reads the author-approved lede from a decision record's body: the merged lede when the record carries one, the
 * agent's lede otherwise. Yields `null` when neither heading appears.
 *
 * Presence decides, never the verdict. A decision the author called `revised` whose two texts differ only by
 * whitespace carries no merged section, and one called `accepted` whose texts differ carries one; a reader keying off
 * the verdict would take the wrong text in both cases.
 *
 * A comment is critique of a lede rather than a lede, and no path here reads it.
 */
export function extractApprovedLede(body: string): string | null {
  return (
    extractSection({ text: body, heading: MERGED_LEDE_HEADING }) ??
    extractSection({ text: body, heading: AGENT_LEDE_HEADING })
  );
}
