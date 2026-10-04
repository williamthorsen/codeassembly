import { describe, expect, it } from 'vitest';

import { convertMarkdownToAdf } from '../convert-body.ts';

describe(convertMarkdownToAdf, () => {
  it('converts a GFM task list to taskList and taskItem nodes', () => {
    const adf = convertMarkdownToAdf('- [ ] open\n- [x] done\n');

    expect(adf.content).toEqual([
      {
        type: 'taskList',
        attrs: { localId: expect.any(String) },
        content: [
          {
            type: 'taskItem',
            attrs: { localId: expect.any(String), state: 'TODO' },
            content: [{ type: 'text', text: 'open' }],
          },
          {
            type: 'taskItem',
            attrs: { localId: expect.any(String), state: 'DONE' },
            content: [{ type: 'text', text: 'done' }],
          },
        ],
      },
    ]);
  });

  it('converts headings and inline code to ADF nodes rather than escaped text', () => {
    const adf = convertMarkdownToAdf('## Problem\n\nRun `acli`.\n');

    expect(adf).toMatchObject({
      type: 'doc',
      version: 1,
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Problem' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Run ' },
            { type: 'text', text: 'acli', marks: [{ type: 'code' }] },
            { type: 'text', text: '.' },
          ],
        },
      ],
    });
  });
});
