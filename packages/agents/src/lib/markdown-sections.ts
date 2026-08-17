/**
 * Reads a named `## ` section from Markdown: everything between the heading and the next `## ` heading or the end of
 * the document, trimmed. Yields `null` when the heading is absent or its section is empty.
 *
 * Matching is line-based and case-insensitive on the heading text.
 */
export function extractSection(input: { text: string; heading: string }): string | null {
  const lines = input.text.split('\n');
  const target = input.heading.trim().toLowerCase();
  let start = -1;

  for (const [index, line] of lines.entries()) {
    if (start === -1) {
      if (line.startsWith('## ') && line.slice(3).trim().toLowerCase() === target) {
        start = index + 1;
      }
      continue;
    }
    if (line.startsWith('## ')) {
      return joinSection(lines.slice(start, index));
    }
  }

  return start === -1 ? null : joinSection(lines.slice(start));
}

// region | Helpers

/** Joins section lines and trims them, yielding `null` for a section that holds no text. */
function joinSection(lines: readonly string[]): string | null {
  const section = lines.join('\n').trim();
  return section.length > 0 ? section : null;
}

// endregion | Helpers
