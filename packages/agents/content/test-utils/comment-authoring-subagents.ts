/**
 * The subagents that write or judge source comments, and so need both halves of the comment guidance: the discipline
 * deciding what a comment may say, carried by an injected skill, and the register deciding its mood, carried by a
 * guidance hook. Because one population is reached by two mechanisms, a subagent added to one route and not the other
 * gets half the guidance; naming it once keeps the two routes from drifting apart.
 *
 * Listed explicitly rather than discovered from the bodies: The failure guarded against is a subagent dropping off,
 * and a discovered list would move with the bug.
 */
export const COMMENT_AUTHORING_SUBAGENTS: ReadonlyArray<string> = [
  'aspect-code-reviewer',
  'aspect-silent-failure-reviewer',
  'aspect-test-reviewer',
  'code-simplification-reviewer',
  'orchestrated-coder',
  'orchestrated-reviewer',
];
