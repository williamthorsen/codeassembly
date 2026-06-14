import type { Readable } from 'node:stream';

/**
 * Reads a readable stream to completion as a UTF-8 string. Callers pass `process.stdin` (binary mode) or a
 * `Readable.from([Buffer])`, both of which emit `Buffer` chunks.
 * @internal
 */
export async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (!Buffer.isBuffer(chunk)) {
      throw new TypeError('readAll: expected Buffer chunks (stream must be in binary mode)');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
