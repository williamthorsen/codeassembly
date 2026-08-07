/** One line of command output and the stream it belongs on. */
export interface ReportLine {
  readonly level: 'info' | 'warn';
  readonly text: string;
}
