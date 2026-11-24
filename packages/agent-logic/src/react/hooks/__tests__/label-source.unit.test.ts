// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { labelSource, type LoadOrigin, type SourceLabel } from '../label-source.ts';

describe(labelSource, () => {
  it.each<[string, LoadOrigin, SourceLabel]>([
    [
      'an example by its name, saved by its slug',
      { kind: 'example', name: 'Refund request', slug: 'refund-request' },
      { source: 'Example: Refund request', downloadName: 'refund-request.prompt-logic.json' },
    ],
    [
      'an opened file by its name, saved without its extension',
      { kind: 'file', fileName: 'support.json' },
      { source: 'File: support.json', downloadName: 'support.prompt-logic.json' },
    ],
    [
      'an opened prompt-logic file, saved under its own name',
      { kind: 'file', fileName: 'support.prompt-logic.json' },
      { source: 'File: support.prompt-logic.json', downloadName: 'support.prompt-logic.json' },
    ],
    [
      'a file written under the earlier name, saved under the current one',
      { kind: 'file', fileName: 'support.agent-logic.json' },
      { source: 'File: support.agent-logic.json', downloadName: 'support.prompt-logic.json' },
    ],
    [
      'an opened file whose name is only an extension',
      { kind: 'file', fileName: '.json' },
      { source: 'File: .json', downloadName: 'prompt.prompt-logic.json' },
    ],
    ['pasted JSON', { kind: 'paste' }, { source: 'Pasted JSON', downloadName: 'pasted.prompt-logic.json' }],
    [
      'a converted prompt by its name, saved by its sanitized name',
      { kind: 'prompt', name: 'Refund Request!' },
      { source: 'Prompt: Refund Request!', downloadName: 'refund-request.prompt-logic.json' },
    ],
  ])('labels %s', (_case, origin, expected) => {
    expect(labelSource(origin)).toStrictEqual(expected);
  });
});
