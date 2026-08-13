import type { Client } from '@modelcontextprotocol/sdk/client';

import { getStringField, toRecord } from './records.ts';

/** Reports whether a `callTool` result carries the error flag. */
export function isErrorResult(result: Awaited<ReturnType<Client['callTool']>>): boolean {
  return 'isError' in result && result.isError === true;
}

/** Parses a `callTool` result, narrows it to a record, and extracts one string field. */
export function parseAndGetString(result: Awaited<ReturnType<Client['callTool']>>, field: string): string {
  return getStringField(toRecord(parseToolResult(result), 'tool result'), field);
}

/** Extracts the text content from a `callTool` result and parses it as JSON. */
export function parseToolResult(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  // Treat the result as unknown to sidestep the SDK's unresolvable content union type.
  const raw: unknown = result;
  const record = toRecord(raw, 'tool result');
  const contentArray = record.content;
  if (!Array.isArray(contentArray)) throw new Error('Result has no content array');
  const first: unknown = contentArray[0];
  if (first === undefined) throw new Error('Result content is empty');
  const firstRecord = toRecord(first, 'content item');
  if (firstRecord.type !== 'text') throw new Error('Expected text content');
  const text = firstRecord.text;
  if (typeof text !== 'string') throw new Error('Expected text to be a string');
  const parsed: unknown = JSON.parse(text);
  return parsed;
}
