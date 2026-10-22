import { Readable } from 'node:stream';

/** Builds a Readable stream that emits the given body and ends. */
export function makeBodyStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}
