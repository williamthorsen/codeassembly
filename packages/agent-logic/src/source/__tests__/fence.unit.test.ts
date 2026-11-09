import { describe, expect, it } from 'vitest';

import { type Fence, isFenceCloser, matchFenceOpener } from '../fence.ts';

describe(matchFenceOpener, () => {
  it('opens a fence at any indentation, as under a nested list item', () => {
    expect(matchFenceOpener('      ```ts')).toStrictEqual({ character: '`', length: 3 });
    expect(matchFenceOpener('\t~~~~')).toStrictEqual({ character: '~', length: 4 });
  });

  it('does not open a backtick fence whose info string contains a backtick', () => {
    expect(matchFenceOpener('```js``` is a span')).toBeUndefined();
  });

  it('opens a tilde fence whose info string contains a backtick', () => {
    expect(matchFenceOpener('~~~ `md`')).toStrictEqual({ character: '~', length: 3 });
  });

  it('does not open a fence for a run shorter than three or a line that does not start with one', () => {
    expect(matchFenceOpener('``x``')).toBeUndefined();
    expect(matchFenceOpener('Run ```this```')).toBeUndefined();
  });
});

describe(isFenceCloser, () => {
  const fence: Fence = { character: '`', length: 4 };

  it('closes on a run at least as long as the opener, at any indentation', () => {
    expect(isFenceCloser('      ````', fence)).toBe(true);
    expect(isFenceCloser('`````  ', fence)).toBe(true);
  });

  it('does not close on a shorter run, the other character, or a run followed by text', () => {
    expect(isFenceCloser('```', fence)).toBe(false);
    expect(isFenceCloser('~~~~', fence)).toBe(false);
    expect(isFenceCloser('```` js', fence)).toBe(false);
  });
});
