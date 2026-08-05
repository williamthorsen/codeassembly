import { describe, expect, it, vi } from 'vitest';

import { runAnimationSuppressingErrors } from '../run-animation-suppressing-errors.js';

describe('runAnimationSuppressingErrors', () => {
  it('resolves once the animation resolves', async () => {
    await expect(runAnimationSuppressingErrors(() => Promise.resolve())).resolves.toBeUndefined();
  });

  it('absorbs a killed-actor rejection without logging', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      runAnimationSuppressingErrors(() => Promise.reject(new Error('Actor has been killed'))),
    ).resolves.toBeUndefined();

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs an unexpected rejection instead of propagating it', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runAnimationSuppressingErrors(() => Promise.reject(new Error('Boom')))).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('Unexpected animation error:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('logs a non-Error rejection', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- exercises the non-Error branch
    await expect(runAnimationSuppressingErrors(() => Promise.reject('Boom'))).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('Unexpected animation error:', 'Boom');
    consoleSpy.mockRestore();
  });
});
