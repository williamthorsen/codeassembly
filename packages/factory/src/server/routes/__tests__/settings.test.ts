import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSettings } from '../../../shared/types/settings.js';
import { silencedConsole } from '../../../test-utils.js';
import { createSettingsRouter, type SettingsProvider } from '../settings.js';
import { createMockResponse, getHandler, type MockResponse } from './route-test-helpers.ts';

function createMockStore(settings: UserSettings): SettingsProvider {
  return {
    load: vi.fn<() => Promise<UserSettings>>().mockResolvedValue(settings),
    patch: vi.fn<(p: Partial<UserSettings>) => Promise<UserSettings>>().mockImplementation((partial) =>
      Promise.resolve({
        ...settings,
        ...partial,
      }),
    ),
  };
}

describe('createSettingsRouter', () => {
  let res: MockResponse;

  beforeEach(() => {
    res = createMockResponse();
  });

  describe('GET /', () => {
    it('returns 200 with default settings when no file exists', async () => {
      const store = createMockStore({ dismissedRuns: {} });
      const router = createSettingsRouter(store);
      const handler = getHandler(router, 'get', '/');

      await handler({ params: {} }, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ dismissedRuns: {} });
    });

    it('returns 200 with persisted settings', async () => {
      const settings: UserSettings = {
        dismissedRuns: { 'a/b/c': { status: 'completed' } },
      };
      const store = createMockStore(settings);
      const router = createSettingsRouter(store);
      const handler = getHandler(router, 'get', '/');

      await handler({ params: {} }, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(settings);
    });

    it('returns 500 when store.load() throws', async () => {
      using _silent = silencedConsole(['error']);
      const store = createMockStore({ dismissedRuns: {} });
      vi.mocked(store.load).mockRejectedValueOnce(new Error('Disk error'));
      const router = createSettingsRouter(store);
      const handler = getHandler(router, 'get', '/');

      await handler({ params: {} }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to load settings' });
    });
  });

  describe('PATCH /', () => {
    it('returns 200 with merged settings on valid body', async () => {
      const store = createMockStore({ dismissedRuns: {} });
      const router = createSettingsRouter(store);
      const handler = getHandler(router, 'patch', '/');

      const body = { dismissedRuns: { 'd/e/f': { status: 'failed' } } };
      await handler({ params: {}, body }, res);

      expect(store.patch).toHaveBeenCalledWith(body);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ dismissedRuns: { 'd/e/f': { status: 'failed' } } });
    });

    it('returns 400 on invalid body', async () => {
      const store = createMockStore({ dismissedRuns: {} });
      const router = createSettingsRouter(store);
      const handler = getHandler(router, 'patch', '/');

      const body = { dismissedRuns: 'not-an-object' };
      await handler({ params: {}, body }, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid settings');
    });

    it('returns 500 when store.patch() throws', async () => {
      using _silent = silencedConsole(['error']);
      const store = createMockStore({ dismissedRuns: {} });
      vi.mocked(store.patch).mockRejectedValueOnce(new Error('Write error'));
      const router = createSettingsRouter(store);
      const handler = getHandler(router, 'patch', '/');

      const body = { dismissedRuns: { 'x/y/z': { status: 'in_progress' } } };
      await handler({ params: {}, body }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to update settings' });
    });

    it('accepts empty body (no-op patch)', async () => {
      const store = createMockStore({ dismissedRuns: { 'a/b/c': { status: 'completed' } } });
      const router = createSettingsRouter(store);
      const handler = getHandler(router, 'patch', '/');

      await handler({ params: {}, body: {} }, res);

      expect(res.statusCode).toBe(200);
      expect(store.patch).toHaveBeenCalledWith({});
    });
  });
});
