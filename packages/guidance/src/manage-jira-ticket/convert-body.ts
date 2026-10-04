import { markdownToAdf } from 'marklassian';

/** Converts a Markdown body to an ADF document, mapping GFM task lists to `taskList` and `taskItem` nodes. */
export function convertMarkdownToAdf(markdown: string): ReturnType<typeof markdownToAdf> {
  return markdownToAdf(markdown);
}
