import { describe, expect, it } from 'vitest';

import { orderItems } from '../order.ts';
import { buildItem, buildRecord } from '../test-utils/build-record.ts';

describe(orderItems, () => {
  it('orders the ticket items by value, then confidence, with record order breaking ties', () => {
    const record = buildRecord({
      items: [
        buildItem({ id: 'nice-high', value: 'nice-to-have', confidence: 'high' }),
        buildItem({ id: 'must-medium', value: 'must-have', confidence: 'medium' }),
        buildItem({ id: 'should-medium-1', value: 'should-have', confidence: 'medium' }),
        buildItem({ id: 'must-high', value: 'must-have', confidence: 'high' }),
        buildItem({ id: 'questionable-high', value: 'questionable', confidence: 'high' }),
        buildItem({ id: 'should-medium-2', value: 'should-have', confidence: 'medium' }),
      ],
    });

    expect(ids(orderItems(record))).toEqual([
      'must-high',
      'must-medium',
      'should-medium-1',
      'should-medium-2',
      'nice-high',
      'questionable-high',
    ]);
  });

  it('places each merge under its target and the comment and drop items last, in record order', () => {
    const record = buildRecord({
      items: [
        buildItem({ id: 'drop', disposition: 'drop', confidence: 'low' }),
        buildItem({ id: 'merge-into-b', disposition: 'merge', target: 'b' }),
        buildItem({ id: 'a', value: 'nice-to-have' }),
        buildItem({ id: 'comment', disposition: 'comment', target: 272 }),
        buildItem({ id: 'b', value: 'must-have' }),
        buildItem({ id: 'merge-into-a', disposition: 'merge', target: 'a' }),
      ],
    });

    expect(ids(orderItems(record))).toEqual(['b', 'merge-into-b', 'a', 'merge-into-a', 'drop', 'comment']);
  });
});

// region | Helpers

/** Returns the ids of `items`, in order. */
function ids(items: ReadonlyArray<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

// endregion | Helpers
