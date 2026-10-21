import { readFile } from 'node:fs/promises';

import { vi } from 'vitest';

/** Mocks `readFile` to reject every read with ENOENT. */
export function mockEnoent(): void {
  const error = new Error('ENOENT: no such file or directory');
  Object.assign(error, { code: 'ENOENT' });
  vi.mocked(readFile).mockRejectedValue(error);
}

/** Mocks `readFile` to resolve the mapped content for a known path and to reject with ENOENT for any other. */
export function mockFileContents(pathContentMap: Record<string, string>): void {
  vi.mocked(readFile).mockImplementation((path: unknown) => {
    const content = typeof path === 'string' ? pathContentMap[path] : undefined;
    if (content !== undefined) {
      return Promise.resolve(content);
    }
    const error = new Error(`ENOENT: no such file or directory, open '${String(path)}'`);
    Object.assign(error, { code: 'ENOENT' });
    return Promise.reject(error);
  });
}

/** Mocks `readFile` to resolve every read with `data` serialized as JSON. */
export function mockJson(data: Record<string, unknown>): void {
  vi.mocked(readFile).mockResolvedValue(JSON.stringify(data));
}
