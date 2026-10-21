/** Resolves with the value with which the operation rejects. */
export async function captureRejection(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the operation to reject, but it resolved.');
}
