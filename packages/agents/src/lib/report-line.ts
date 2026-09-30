import type { OutputGlyphName } from './output-glyphs.ts';

/** One line of command output and the stream on which it belongs. */
export interface ReportLine {
  /** The status glyph that leads the line; the emitter renders it in the stream's style. */
  readonly glyph?: OutputGlyphName;
  /** Spaces before the glyph, or before the text when the line has no glyph. */
  readonly indent?: number;
  readonly level: 'error' | 'info' | 'warn';
  readonly text: string;
}
