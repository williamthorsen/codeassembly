/**
 * The composite key a lane is indexed by, shared by the store's fold map, the git adapter's targets, and the
 * snapshot's observation lookup — the format is a producer/consumer contract, so it has exactly one definition.
 */
export function buildLaneKey(lane: { branch: string; repo: string }): string {
  return `${lane.repo}/${lane.branch}`;
}
