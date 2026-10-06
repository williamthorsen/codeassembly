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

/**
 * Replaces the body of each named `## ` section, matching headings as `extractSection` does, and appends each named
 * section that `text` does not contain, in the given order. The text outside the named sections is kept as it is.
 */
export function replaceSections(input: {
  text: string;
  sections: ReadonlyArray<{ body: string; heading: string }>;
}): string {
  const pending = new Map(input.sections.map((section) => [section.heading.trim().toLowerCase(), section]));
  const output: string[] = [];
  let isReplacing = false;
  for (const line of input.text.split('\n')) {
    if (line.startsWith('## ')) {
      const key = line.slice(3).trim().toLowerCase();
      const section = pending.get(key);
      isReplacing = section !== undefined;
      if (section !== undefined) {
        pending.delete(key);
        output.push(line, '', section.body.trim(), '');
        continue;
      }
    }
    if (!isReplacing) output.push(line);
  }

  const appended = pending.values().map((section) => `## ${section.heading.trim()}\n\n${section.body.trim()}`);
  return `${[output.join('\n').trimEnd(), ...appended].filter((block) => block !== '').join('\n\n')}\n`;
}

// region | Helpers

/** Joins section lines and trims them, yielding `null` for a section that does not contain any text. */
function joinSection(lines: readonly string[]): string | null {
  const section = lines.join('\n').trim();
  return section.length > 0 ? section : null;
}

// endregion | Helpers
