/**
 * Detection of the two constraints the repository-root guidance file carries by virtue of being harness-neutral:
 * it reaches into no harness-owned directory, and it hosts no rulebook marker.
 *
 * One body of text serves every harness, so wiring owned by one of them is a wrong turn for every other reader.
 * Home-anchored and repository-local spellings are both matched, because `~/.claude/skills/` and `.claude/` name
 * the same harness's territory. A rulebook marker is `sync`'s to write: it strips a complete open/close pair from
 * this file, so a hand-written region disappears on the next run, and an unpaired marker escapes the sweep and
 * lingers instead. Both marker spellings are matched, which is why the rule covers the marker, not the region.
 *
 * Every function is a pure string transform with no filesystem access.
 */

/** A directory belonging to one harness, in either the home-anchored or the repository-local spelling. */
const HARNESS_PATH_REGEX = /(?:~\/)?\.(?:claude|rovodev)\//;

/** A rulebook marker's token, matched whether it opens or closes a region and whether or not it is paired. */
const RULEBOOK_MARKER_REGEX = /<!--\s*\/?\s*rulebook:/;

/** One constraint violation: the 1-based line it sits on, and that line's text. */
export interface GuidanceViolation {
  readonly lineNumber: number;
  readonly text: string;
}

/** Renders violations as a one-line detail, naming each offending line so a failure points at the text to fix. */
export function describeViolations(violations: ReadonlyArray<GuidanceViolation>): string {
  return violations.map((violation) => `line ${violation.lineNumber}: ${violation.text.trim()}`).join('; ');
}

/** Finds every line reaching into a harness-owned directory, home-anchored or repository-local. */
export function findHarnessScopedPaths(content: string): ReadonlyArray<GuidanceViolation> {
  return findMatchingLines(content, HARNESS_PATH_REGEX);
}

/** Finds every line carrying a rulebook marker, paired or not. */
export function findRulebookMarkers(content: string): ReadonlyArray<GuidanceViolation> {
  return findMatchingLines(content, RULEBOOK_MARKER_REGEX);
}

// region | Helpers

/** Collects the lines matching a pattern, paired with their 1-based line numbers. */
function findMatchingLines(content: string, pattern: RegExp): ReadonlyArray<GuidanceViolation> {
  const violations: Array<GuidanceViolation> = [];
  const numberedLines = content.split('\n').entries();
  for (const [index, text] of numberedLines) {
    if (pattern.test(text)) {
      violations.push({ lineNumber: index + 1, text });
    }
  }
  return violations;
}

// endregion | Helpers
