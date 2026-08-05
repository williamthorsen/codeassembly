import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { readAll } from '../stream-helpers.ts';

describe(readAll, () => {
  it('concatenates multiple Buffer chunks into a single UTF-8 string', async () => {
    const stream = Readable.from([Buffer.from('hello '), Buffer.from('world')]);
    await expect(readAll(stream)).resolves.toBe('hello world');
  });

  it('decodes multi-byte UTF-8 sequences split across chunk boundaries', async () => {
    const encoded = Buffer.from('café', 'utf8');
    const stream = Readable.from([encoded.subarray(0, 4), encoded.subarray(4)]);
    await expect(readAll(stream)).resolves.toBe('café');
  });

  it('returns an empty string for a stream with no chunks', async () => {
    await expect(readAll(Readable.from([]))).resolves.toBe('');
  });

  it('throws a TypeError when a chunk is not a Buffer', async () => {
    const stream = Readable.from(['not-a-buffer'], { objectMode: true });
    await expect(readAll(stream)).rejects.toThrow(TypeError);
  });
});
