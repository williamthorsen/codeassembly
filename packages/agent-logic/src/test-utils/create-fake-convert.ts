import type { ConvertWithAgentOptions } from '../agent/convert-with-agent.ts';
import type { ConvertResult } from '../convert/convert-prompt.ts';
import type { ConvertFunction } from '../server/create-conversion-handler.ts';

/** A call of the fake `convert`, which the test ends by settling it. */
export interface FakeConvertCall {
  readonly options: ConvertWithAgentOptions;
  /** Ends the run with a `result` event. */
  resolve(result: ConvertResult): void;
  /** Ends the run by throwing the error. */
  reject(error: unknown): void;
}

/**
 * Creates a `convert` that waits for the test to settle each call, and rejects when the signal aborts first.
 */
export function createFakeConvert(): { convert: ConvertFunction; calls: FakeConvertCall[] } {
  const calls: FakeConvertCall[] = [];
  async function* convert(options: ConvertWithAgentOptions): AsyncGenerator<{ type: 'result'; result: ConvertResult }> {
    const result = await new Promise<ConvertResult>((resolve, reject) => {
      calls.push({ options, resolve, reject });
      options.signal?.addEventListener('abort', () => {
        reject(new Error('The run was aborted.', { cause: options.signal?.reason }));
      });
    });
    yield { type: 'result', result };
  }
  return { convert, calls };
}
