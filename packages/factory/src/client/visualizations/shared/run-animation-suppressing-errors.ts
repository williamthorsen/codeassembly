import { describeError } from '@williamthorsen/toolbelt.errors/candidate';

/**
 * Awaits an actor animation, absorbing the rejection Excalibur raises when the actor is killed
 * mid-playback, as happens when a scene is cleared during playback. Any other rejection is logged
 * instead of propagating, so callers may leave the result unawaited.
 */
export async function runAnimationSuppressingErrors(animate: () => Promise<void>): Promise<void> {
  try {
    await animate();
  } catch (error: unknown) {
    const message = describeError(error);
    if (!message.includes('Actor has been killed')) {
      console.error('Unexpected animation error:', error);
    }
  }
}
