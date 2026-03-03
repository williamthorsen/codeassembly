import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

/** Type guard: narrows unknown to Record<string, unknown>. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrow unknown to Record<string, unknown> or throw. */
export function toRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Expected ${label} to be an object`);
  return value;
}

/**
 * Extract the text content from a callTool result and parse it as JSON.
 * The result is treated as unknown and narrowed via runtime checks to avoid
 * interacting with the SDK's complex content union type directly.
 */
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

/**
 * Extract a string property from a record.
 */
export function getStringField(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== 'string') throw new Error(`Expected string for ${field}, got ${typeof value}`);
  return value;
}

export function isErrorResult(result: Awaited<ReturnType<Client['callTool']>>): boolean {
  return 'isError' in result && result.isError === true;
}

/** Parse a tool result, narrow to record, and extract a string field in one call. */
export function parseAndGetString(result: Awaited<ReturnType<Client['callTool']>>, field: string): string {
  return getStringField(toRecord(parseToolResult(result), 'tool result'), field);
}

/** Parse a JSONL line into a Record<string, unknown>. */
export function parseJsonlLine(line: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(line);
  return toRecord(parsed, 'JSONL line');
}
