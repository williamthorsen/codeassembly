import { measureGlyphColumn, type OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

import { OUTPUT_GLYPHS } from './output-glyphs.ts';
import type { ReportLine } from './report-line.ts';

/** The glyph style of each output stream. */
export interface OutputStyles {
  readonly stderr: OutputStyle;
  readonly stdout: OutputStyle;
}

// Plain until the CLI entry point resolves the styles, so output written without a configured style carries no emoji.
let configuredStyles: OutputStyles = { stderr: 'plain', stdout: 'plain' };

/** Sets the glyph style of each stream for every line emitted afterwards. */
export function configureOutputStyle(styles: OutputStyles): void {
  configuredStyles = styles;
}

/** Writes each report line to the stream that its level names. */
export function emitReport(lines: ReadonlyArray<ReportLine>): void {
  for (const line of lines) {
    printLine(line);
  }
}

/** Writes one report line to the stream that its level names, rendered in that stream's style. */
export function printLine(line: ReportLine): void {
  if (line.level === 'info') {
    console.info(renderReportLine(line, configuredStyles.stdout));
    return;
  }
  const text = renderReportLine(line, configuredStyles.stderr);
  if (line.level === 'error') {
    console.error(text);
    return;
  }
  console.warn(text);
}

/** Returns the glyph style configured for a stream. */
export function readOutputStyle(stream: keyof OutputStyles): OutputStyle {
  return configuredStyles[stream];
}

/**
 * Renders a line as its indent, its glyph padded to the glyph set's gutter, and its text, aligning each continuation
 * line under the text. A line without a glyph is its indent and its text, unchanged.
 */
export function renderReportLine(line: ReportLine, style: OutputStyle): string {
  const indent = ' '.repeat(line.indent ?? 0);
  if (line.glyph === undefined) {
    return indent + line.text;
  }
  const glyphs = OUTPUT_GLYPHS[style];
  const glyph = glyphs[line.glyph];
  const gutter = measureGlyphColumn(glyphs) + 1;
  const continuationIndent = ' '.repeat(indent.length + gutter);
  const text = line.text
    .split('\n')
    .map((segment, index) => (index === 0 || segment === '' ? segment : continuationIndent + segment))
    .join('\n');
  return indent + glyph.text + ' '.repeat(gutter - glyph.width) + text;
}
