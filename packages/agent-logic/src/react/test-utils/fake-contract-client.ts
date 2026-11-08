import type { ContractSnapshot } from '@williamthorsen/telefactor/client';

import type { ViewerContract, ViewerContractClient, ViewerState } from '../hooks/useAgentBridge.ts';

/** A call that the page made, by action name and input. */
export interface RecordedCall {
  name: string;
  input: unknown;
}

/** A contract client that the test drives: it emits the snapshots that the test pushes and records the page's calls. */
export interface FakeContractClient {
  client: ViewerContractClient;
  calls: RecordedCall[];
  /** Emits the first snapshot, which connects the page. */
  connect: (state?: ViewerState) => void;
  /** Emits a commit that the agent made with the action given. */
  commitAsAgent: (action: string, state: ViewerState) => void;
}

/** Creates a contract client whose stream emits only what the test pushes, and whose calls commit nothing. */
export function createFakeContractClient(): FakeContractClient {
  const calls: RecordedCall[] = [];
  let listener: ((snapshot: ContractSnapshot<ViewerContract>) => void) | undefined;
  let version = 0;

  const client: ViewerContractClient = {
    call: (name, input) => {
      calls.push({ name, input });
      return Promise.resolve({ version, state: {} });
    },
    getState: () => Promise.resolve({ version, state: {} }),
    subscribe: (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
  };

  return {
    client,
    calls,
    connect: (state = {}) => {
      listener?.({ version, state });
    },
    commitAsAgent: (action, state) => {
      version += 1;
      listener?.({ version, state, change: { action, origin: 'agent' } });
    },
  };
}

/** A contract client whose stream fails before its first snapshot, as a built page's does. */
export const unservedContractClient: ViewerContractClient = {
  call: () => Promise.reject(new Error('The test does not serve the contract.')),
  getState: () => Promise.reject(new Error('The test does not serve the contract.')),
  subscribe: (_listener, options) => {
    queueMicrotask(() => options?.onError?.(new Error('The test does not serve the contract.')));
    return endNothing;
  },
};

// region | Helpers
/** Ends a subscription that holds nothing. */
function endNothing(): void {
  // The failed stream holds no connection.
}
// endregion | Helpers
