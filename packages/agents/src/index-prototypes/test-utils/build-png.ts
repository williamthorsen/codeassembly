import { deflateSync } from 'node:zlib';

/** Builds a valid single-colour 8-bit RGB PNG of the given dimensions. */
export function buildPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  const row = Buffer.alloc(1 + width * 3, 0x80);
  row[0] = 0;
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    buildChunk('IHDR', header),
    buildChunk('IDAT', deflateSync(pixels)),
    buildChunk('IEND', Buffer.alloc(0)),
  ]);
}

// region | Helpers

/** Builds one PNG chunk: length, type, data, and the CRC of type and data. */
function buildChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(computeCrc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/** Computes the CRC-32 that PNG chunks use. */
function computeCrc32(bytes: Buffer): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb8_8320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

// endregion | Helpers
