/** A Markdown file split at its frontmatter block. */
interface SplitFrontmatter {
  /** The frontmatter's lines, without the `---` delimiters. */
  readonly lines: ReadonlyArray<string>;
  /** Everything after the closing `---`, including the leading newline. */
  readonly body: string;
}

/** Splits a Markdown file into its frontmatter lines and the body after the block's closing `---`. */
export function splitFrontmatter(content: string): SplitFrontmatter {
  const rawLines = content.split('\n');
  const lines: Array<string> = [];
  let delimiterCount = 0;

  for (const [index, line] of rawLines.entries()) {
    if (line === '---') {
      delimiterCount++;
      if (delimiterCount === 2) {
        return { lines, body: rawLines.slice(index + 1).join('\n') };
      }
      continue;
    }
    if (delimiterCount === 1) {
      lines.push(line);
    }
  }

  return { lines, body: '' };
}
