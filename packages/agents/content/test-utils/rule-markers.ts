/** A rule marker, `<!-- rule: <id> -->` or `<!-- rule: <id> <version> -->`, as a body declares it. */
export interface RuleMarker {
  readonly id: string;
  readonly version: string | undefined;
}

/** A `##` section of a body, from its heading to the next `##` heading or the end of the body. */
export interface RuleSection {
  readonly heading: string;
  /** The marker on the first non-blank line beneath the heading, if that line is one. */
  readonly marker: RuleMarker | undefined;
  /** The section's source text from its heading line on, fenced lines included as written. */
  readonly text: string;
}

/** Stands in for a line inside a code fence, which is neither a heading nor a marker but is not blank. */
const FENCED_LINE = '<fenced>';

/** Matches a rule heading, whose captured group is the heading text. */
const RULE_HEADING_REGEX = /^## (.+)$/;

/**
 * Matches a marker alone on its line, whose captured groups are the id and any version token. A marker quoted inside a
 * sentence declares nothing. The version is matched loosely, so that a malformed one reads as malformed rather than as
 * no marker at all.
 */
const RULE_MARKER_REGEX = /^<!--\s*rule:\s*([a-z][a-z0-9-]*)(?:\s+(\S.*?))?\s*-->$/;

/** Returns every rule marker that a body declares, in order. */
export function listRuleMarkers(body: string): RuleMarker[] {
  return maskFencedLines(body).flatMap((line) => {
    const marker = parseRuleMarker(line);
    return marker === undefined ? [] : [marker];
  });
}

/** Returns every `##` section of a body, in order. */
export function listRuleSections(body: string): RuleSection[] {
  const sourceLines = body.split('\n');
  const maskedLines = maskFencedLines(body);
  const headings = maskedLines.flatMap((line, index) => {
    const heading = RULE_HEADING_REGEX.exec(line)?.[1];
    return heading === undefined ? [] : [{ heading, index }];
  });

  return headings.map(({ heading, index }, position) => {
    const end = headings[position + 1]?.index ?? maskedLines.length;
    const firstLine = maskedLines.slice(index + 1, end).find((line) => line.trim() !== '');
    return {
      heading,
      marker: firstLine === undefined ? undefined : parseRuleMarker(firstLine),
      text: sourceLines.slice(index, end).join('\n'),
    };
  });
}

// region | Helpers

/** Splits a body into lines, replacing each line of a code fence with a placeholder that matches no heading or marker. */
function maskFencedLines(body: string): string[] {
  let fenced = false;
  return body.split('\n').map((line) => {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      return FENCED_LINE;
    }
    return fenced ? FENCED_LINE : line;
  });
}

/** Parses a line that is a marker alone, or returns undefined for any other line. */
function parseRuleMarker(line: string): RuleMarker | undefined {
  const match = RULE_MARKER_REGEX.exec(line);
  const id = match?.[1];
  return id === undefined ? undefined : { id, version: match?.[2] };
}

// endregion | Helpers
