/**
 * Builds the composite key by which a lane is indexed. Every map keyed by lane takes its keys from this one
 * definition, because the code that writes a key and the code that looks it up must agree on the format.
 */
export function buildLaneKey(lane: { branch: string; repo: string }): string {
  return `${lane.repo}/${lane.branch}`;
}
