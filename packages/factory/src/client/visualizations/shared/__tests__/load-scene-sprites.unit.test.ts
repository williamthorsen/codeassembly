import { describe, expect, it, vi } from 'vitest';

import { loadSceneSprites } from '../load-scene-sprites.js';

describe('loadSceneSprites', () => {
  it('resolves once the load resolves', async () => {
    await expect(loadSceneSprites(() => Promise.resolve(), 'Failed:')).resolves.toBeUndefined();
  });

  it('logs a failed load under the given message instead of propagating it', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      loadSceneSprites(() => Promise.reject(new Error('Boom')), 'Failed to load catwalk sprites:'),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load catwalk sprites:', expect.any(Error));
    consoleSpy.mockRestore();
  });
});
