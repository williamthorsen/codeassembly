/**
 * Counts the lines in a guidance file's content. A trailing newline terminates the final line rather than
 * starting an empty one, so the count matches what an editor reports.
 */
export function countGuidanceLines(content: string): number {
  if (content === '') {
    return 0;
  }
  const withoutFinalNewline = content.endsWith('\n') ? content.slice(0, -1) : content;
  return withoutFinalNewline.split('\n').length;
}
