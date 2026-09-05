import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it } from 'vitest';

import { loadSceneSprites } from '../load-scene-sprites.ts';

describe('loadSceneSprites', () => {
  it('resolves once the load resolves', async () => {
    await expect(loadSceneSprites(() => Promise.resolve(), 'Failed:')).resolves.toBeUndefined();
  });

  it('logs a failed load under the given message instead of propagating it', async () => {
    using silent = silenceConsole(['error']);

    await expect(
      loadSceneSprites(() => Promise.reject(new Error('Boom')), 'Failed to load catwalk sprites:'),
    ).resolves.toBeUndefined();

    expect(silent.error).toHaveBeenCalledWith('Failed to load catwalk sprites:', expect.any(Error));
  });
});
