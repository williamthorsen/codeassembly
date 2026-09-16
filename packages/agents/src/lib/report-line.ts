/** One line of command output and the stream on which it belongs. */
export interface ReportLine {
  readonly level: 'info' | 'warn';
  readonly text: string;
}
