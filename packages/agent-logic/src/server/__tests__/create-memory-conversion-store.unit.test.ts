import { describe, expect, it } from 'vitest';

import type { ConversionState } from '../../conversion-protocol/conversion-schemas.ts';
import { createMemoryConversionStore } from '../create-memory-conversion-store.ts';

const RUNNING: ConversionState = {
  status: 'running',
  id: 'c1',
  name: 'a.md',
  startedAt: '2026-11-16T12:00:00.000Z',
  deadline: '2026-11-16T12:10:00.000Z',
};

describe(createMemoryConversionStore, () => {
  it('finishes a running conversion', async () => {
    const store = createMemoryConversionStore();
    await store.create(RUNNING);

    await expect(store.finish('c1', { status: 'cancelled', id: 'c1', name: 'a.md' })).resolves.toBe(true);
    await expect(store.read('c1')).resolves.toStrictEqual({ status: 'cancelled', id: 'c1', name: 'a.md' });
  });

  it('leaves an ended conversion as it is and reports that it did not finish it', async () => {
    const store = createMemoryConversionStore();
    await store.create(RUNNING);
    await store.finish('c1', { status: 'cancelled', id: 'c1', name: 'a.md' });

    await expect(store.finish('c1', { status: 'failed', id: 'c1', name: 'a.md', reason: 'Late.' })).resolves.toBe(
      false,
    );
    await expect(store.read('c1')).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('does not finish a conversion that it does not have', async () => {
    const store = createMemoryConversionStore();

    await expect(store.finish('c1', { status: 'cancelled', id: 'c1', name: 'a.md' })).resolves.toBe(false);
    await expect(store.read('c1')).resolves.toBeUndefined();
  });

  it('drops an ended conversion once the retention period has passed, and keeps a running one', async () => {
    let time = 0;
    const store = createMemoryConversionStore({ retentionMs: 1000, now: () => time });
    await store.create(RUNNING);
    await store.create({ ...RUNNING, id: 'c2' });
    await store.finish('c1', { status: 'cancelled', id: 'c1', name: 'a.md' });

    time = 999;
    await expect(store.read('c1')).resolves.toBeDefined();

    time = 1000;
    await expect(store.read('c1')).resolves.toBeUndefined();
    await expect(store.read('c2')).resolves.toMatchObject({ status: 'running' });
  });
});
