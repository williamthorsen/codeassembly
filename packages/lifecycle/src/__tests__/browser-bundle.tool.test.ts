// Executable gate for the browser-safety contract: the public surface must bundle for the browser, so an exported
// module that gains a Node builtin import fails this test rather than the first downstream web build.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.ts');

describe('the public surface', () => {
  it('bundles for the browser platform', async () => {
    const result = await build({
      entryPoints: [ENTRY],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2022',
      write: false,
    });

    expect(result.errors).toEqual([]);
  });
});
