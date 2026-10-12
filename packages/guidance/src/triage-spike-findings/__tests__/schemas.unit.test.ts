import { describe, expect, it } from 'vitest';

import { checkGate, findMissingTickets, RecordSchema } from '../schemas.ts';
import { buildItem, buildRecord } from '../test-utils/build-record.ts';

describe('RecordSchema', () => {
  it('accepts a record with one item per disposition', () => {
    expect(RecordSchema.safeParse(buildRecord()).success).toBe(true);
  });

  it('rejects a record without items', () => {
    expect(RecordSchema.safeParse(buildRecord({ items: [] })).success).toBe(false);
  });

  it('rejects a grade outside its family', () => {
    const record = { ...buildRecord(), items: [{ ...buildItem(), confidence: 'certain' }] };
    expect(RecordSchema.safeParse(record).success).toBe(false);
  });
});

describe(checkGate, () => {
  it('passes a record that meets every clause', () => {
    expect(checkGate(buildRecord())).toEqual([]);
  });

  it('refuses a ticket at low confidence', () => {
    const record = buildRecord({ items: [buildItem({ confidence: 'low' })] });
    expect(checkGate(record)).toEqual([{ id: '10', clause: 'a low item does not take a ticket' }]);
  });

  it('refuses a merge whose target is not a ticket item', () => {
    const record = buildRecord({
      items: [
        buildItem({ id: 'a', disposition: 'drop' }),
        buildItem({ id: 'b', disposition: 'merge', target: 'a' }),
        buildItem({ id: 'c', disposition: 'merge', target: 'missing' }),
      ],
    });
    expect(checkGate(record).map((violation) => violation.id)).toEqual(['b', 'c']);
  });

  it('refuses a comment without an issue number', () => {
    const record = buildRecord({ items: [buildItem({ disposition: 'comment', target: '#272' })] });
    expect(checkGate(record)).toEqual([{ id: '10', clause: 'a comment names an issue number as its target' }]);
  });

  it('refuses a target on a ticket or a drop', () => {
    const record = buildRecord({
      items: [buildItem({ id: 't', target: 5 }), buildItem({ id: 'd', disposition: 'drop', target: 'x' })],
    });
    expect(checkGate(record).map((violation) => violation.clause)).toEqual([
      'a ticket item does not have a target',
      'a drop item does not have a target',
    ]);
  });

  it('refuses a ticket number on an item that does not take a ticket', () => {
    const record = buildRecord({ items: [buildItem({ disposition: 'drop', ticket: 300 })] });
    expect(checkGate(record)).toEqual([{ id: '10', clause: 'a drop item does not carry a ticket number' }]);
  });

  it('refuses a duplicate id and reports every violation of a record', () => {
    const record = buildRecord({
      items: [buildItem({ id: 'x' }), buildItem({ id: 'x', confidence: 'low' })],
    });
    expect(checkGate(record)).toEqual([
      { id: 'x', clause: 'the id is declared more than once' },
      { id: 'x', clause: 'a low item does not take a ticket' },
    ]);
  });
});

describe(findMissingTickets, () => {
  it('names the ticket items without a number and the missing umbrella', () => {
    expect(findMissingTickets(buildRecord())).toEqual({ items: ['10'], umbrella: true });
  });

  it('reports nothing missing once every number is recorded', () => {
    const record = buildRecord({ umbrella: 281, items: [buildItem({ ticket: 282 })] });
    expect(findMissingTickets(record)).toEqual({ items: [], umbrella: false });
  });
});
