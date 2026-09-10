import { describe, expect, it } from 'vitest';

import { findUnderdeclaredFormatDefects } from '../../src/lib/content-validation.ts';

// The format a root declares is what an older `codeassembly` reads to decide whether it can deploy the root at all.
// A body using a form the declared format predates is therefore invisible to that tool: it deploys the root, fails to
// match the token, and ships the token's literal text. `codeassembly validate` reports this for a consumer's root, but
// nothing in this repository runs `validate` over the built-in library, so this suite is what holds the library to the
// same rule.

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

describe('content-format declaration', () => {
  it('honors every token form the library’s bodies use', async () => {
    const defects = await findUnderdeclaredFormatDefects(CONTENT_ROOT);

    const message =
      'A body uses a token form the library’s declared content format predates. Raise `format` in ' +
      `codeassembly-content.yaml, or write the token in its required form:\n  ${defects
        .map((defect) => `${defect.file}: ${defect.detail}`)
        .join('\n  ')}`;
    expect(defects, message).toEqual([]);
  });
});
