/** Fake `collect` dependencies that answer from test-supplied handlers and record every call. */
import { writeFileSync } from 'node:fs';

import type { CollectDependencies } from '../collect.ts';

/** A handler's answer: an HTTP status with a body, or an error that the fake throws as a failed request. */
export type FakeResponse = Error | { status: number; body: unknown };

/** The handlers behind the fakes; an unset handler fails the test when its service is reached. */
export interface FakeHandlers {
  psi?: (url: string, strategy: string) => FakeResponse;
  /** Returns the report to write, or an Error for a run that fails. */
  lighthouse?: (url: string, formFactor: 'desktop' | 'mobile') => unknown;
  crux?: (query: Record<string, unknown>) => FakeResponse;
  cruxKey?: string;
}

/** The calls that the fakes received, in order. */
export interface FakeCalls {
  psi: Array<{ url: string; strategy: string }>;
  lighthouse: Array<{ url: string; formFactor: 'desktop' | 'mobile'; cwd: string }>;
  crux: Array<Record<string, unknown>>;
}

/** Builds fake dependencies over the handlers, returning them with the record of their calls. */
export function buildFakeDependencies(handlers: FakeHandlers): { dependencies: CollectDependencies; calls: FakeCalls } {
  const calls: FakeCalls = { psi: [], lighthouse: [], crux: [] };
  const dependencies: CollectDependencies = {
    fetchJson: async (url, init) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'www.googleapis.com') {
        const target = parsed.searchParams.get('url') ?? '';
        const strategy = parsed.searchParams.get('strategy') ?? '';
        calls.psi.push({ url: target, strategy });
        if (handlers.psi === undefined) throw new Error('PSI must not be called');
        return answer(handlers.psi(target, strategy));
      }
      const query: unknown = JSON.parse(init?.body ?? '{}');
      if (typeof query !== 'object' || query === null) throw new Error('CrUX query is not an object');
      const record = Object.fromEntries(Object.entries(query));
      calls.crux.push(record);
      if (handlers.crux === undefined) throw new Error('CrUX must not be called');
      return answer(handlers.crux(record));
    },
    runPnpm: (args, cwd) => {
      const url = args[2] ?? '';
      const formFactor = args.includes('--preset=desktop') ? 'desktop' : 'mobile';
      calls.lighthouse.push({ url, formFactor, cwd });
      if (handlers.lighthouse === undefined) return Promise.reject(new Error('Lighthouse must not run'));
      const report = handlers.lighthouse(url, formFactor);
      if (report instanceof Error) return Promise.reject(report);
      const output = args.find((arg) => arg.startsWith('--output-path='))?.slice('--output-path='.length);
      if (output === undefined) return Promise.reject(new Error('Lighthouse was run without --output-path'));
      writeFileSync(output, JSON.stringify(report), 'utf8');
      return Promise.resolve('');
    },
    readCruxKey: () => handlers.cruxKey,
    now: () => new Date('2026-11-01T12:00:00Z'),
  };
  return { dependencies, calls };
}

// region | Helpers

/** Resolves a handler's answer, rejecting with an error answer as a failed request. */
function answer(response: FakeResponse): Promise<{ status: number; body: unknown }> {
  return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
}

// endregion | Helpers
