import { toRecord } from './records.ts';

/** Parses one JSONL line into a record. */
export function parseJsonlLine(line: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(line);
  return toRecord(parsed, 'JSONL line');
}
