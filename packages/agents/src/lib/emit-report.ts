import type { ReportLine } from './report-line.ts';

/** Writes each report line to the stream its level names. */
export function emitReport(lines: ReadonlyArray<ReportLine>): void {
  for (const line of lines) {
    if (line.level === 'warn') {
      console.warn(line.text);
      continue;
    }
    console.info(line.text);
  }
}
