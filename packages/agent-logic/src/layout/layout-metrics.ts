// Metrics that more than one of the layout's size estimates reads; they match the canvas styles.

/** The left padding of a flow: room for the initial mark, which sits outside a state's left edge. */
export const COMPOUND_PADDING_LEFT = 28;

/** The right padding of a flow, before any width that `layoutConfig` adds to reach a preamble's width. */
export const COMPOUND_PADDING_RIGHT = 20;

/** Counts the lines that text takes when wrapped at a width, from an average character width. */
export function countWrappedLines(lines: string[], width: number, characterWidth: number): number {
  const charactersPerLine = Math.floor(width / characterWidth);
  return lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
}
