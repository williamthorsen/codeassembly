import assert from 'node:assert/strict';

import { describe, expect, it, vi } from 'vitest';

import { makeRegistryPath, makeTempDir } from '../../test-utils/index.ts';
import { create } from '../create.ts';

// Forces the registry writer to report a name collision detected at write time — a TOCTOU race the `isNameRegistered`
// pre-flight cannot catch — so the test can pin how `create` reconciles the two layers guarding the same invariant.
vi.mock('../../discovery/register-store.ts', () => ({
  registerStore: vi.fn(() => Promise.resolve({ status: 'already-present' })),
}));

describe('create with a write-time registry collision', () => {
  it('returns a name-registered failure when registerStore reports already-present', async () => {
    const targetDir = await makeTempDir('kb-create-race-');
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(!outcome.ok);
    expect(outcome.reason).toBe('name-registered');
  });
});
