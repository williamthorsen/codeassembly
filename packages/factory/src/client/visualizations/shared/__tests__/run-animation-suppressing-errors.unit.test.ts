import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it } from 'vitest';

import { runAnimationSuppressingErrors } from '../run-animation-suppressing-errors.ts';

describe('runAnimationSuppressingErrors', () => {
  it('resolves once the animation resolves', async () => {
    await expect(runAnimationSuppressingErrors(() => Promise.resolve())).resolves.toBeUndefined();
  });

  it('absorbs a killed-actor rejection without logging', async () => {
    using silent = silenceConsole(['error']);

    await expect(
      runAnimationSuppressingErrors(() => Promise.reject(new Error('Actor has been killed'))),
    ).resolves.toBeUndefined();

    expect(silent.error).not.toHaveBeenCalled();
  });

  it('logs an unexpected rejection instead of propagating it', async () => {
    using silent = silenceConsole(['error']);

    await expect(runAnimationSuppressingErrors(() => Promise.reject(new Error('Boom')))).resolves.toBeUndefined();

    expect(silent.error).toHaveBeenCalledWith('Unexpected animation error:', expect.any(Error));
  });

  it('logs a non-Error rejection', async () => {
    using silent = silenceConsole(['error']);

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- exercises the non-Error branch
    await expect(runAnimationSuppressingErrors(() => Promise.reject('Boom'))).resolves.toBeUndefined();

    expect(silent.error).toHaveBeenCalledWith('Unexpected animation error:', 'Boom');
  });
});
