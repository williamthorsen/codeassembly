import process from 'node:process';

/** Width assumed when no terminal width is available, as for piped output. */
const FALLBACK_WIDTH = 120;

/** The stream properties that the width decision reads, so that a test can supply a stub. */
export interface TerminalWidthSource {
  readonly isTTY?: boolean;
  readonly columns?: number;
}

/**
 * Resolves the column count to render at: the stream's own width when it reports one, else a fixed fallback that
 * keeps redirected and captured output deterministic. `columns` is typed `number` but is `undefined` at runtime on a
 * stream that is not a TTY, so the value decides rather than the type.
 */
export function resolveTerminalWidth(stream: TerminalWidthSource = process.stdout): number {
  if (stream.isTTY !== true) {
    return FALLBACK_WIDTH;
  }
  return stream.columns ?? FALLBACK_WIDTH;
}
