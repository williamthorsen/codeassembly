import type { ContractClient, ContractSnapshot } from '@williamthorsen/telefactor/client';
import type { ContractState } from '@williamthorsen/telefactor/contract';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { viewerContract } from '../../contract/viewer-contract.ts';
import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import type { SourceLabel } from './label-source.ts';

export type ViewerContract = typeof viewerContract;
export type ViewerContractClient = ContractClient<ViewerContract>;
export type ViewerState = ContractState<ViewerContract>;

interface AgentBridgeHandlers {
  /** Receives the session state once the dev server first answers. */
  onConnect: (state: ViewerState) => void;
  /** Receives each commit that the agent makes, with the name of the action that made it. */
  onAgentChange: (action: string, state: ViewerState) => void;
}

/** The page's link to the session state that it shares with an agent. */
export interface AgentBridge {
  /** Whether the dev server serves the contract; a built page never connects. */
  isConnected: boolean;
  publishChart: (label: SourceLabel, config: AgentLogicConfig) => void;
  publishSelection: (path: string | undefined) => void;
}

/**
 * Subscribes to the viewer's session state, reports the agent's commits, and publishes the page's loads and selections
 * in the order in which the page makes them. A stream that fails before its first snapshot ends the subscription, as
 * under `vite build` or `vite preview`, which do not serve the contract.
 */
export function useAgentBridge(client: ViewerContractClient | undefined, handlers: AgentBridgeHandlers): AgentBridge {
  const [isConnected, setIsConnected] = useState(false);
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });
  // Read by `send`, so that a publish made from `onConnect` goes out before the state update renders.
  const isConnectedRef = useRef(false);
  // Serialize the calls, so that a selection made right after a load reaches the server after that load.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (client === undefined) return;
    let hasSnapshot = false;
    const unsubscribe = client.subscribe(
      (snapshot: ContractSnapshot<ViewerContract>) => {
        if (!hasSnapshot) {
          hasSnapshot = true;
          isConnectedRef.current = true;
          setIsConnected(true);
          handlersRef.current.onConnect(snapshot.state);
          return;
        }
        if (snapshot.change?.origin === 'agent')
          handlersRef.current.onAgentChange(snapshot.change.action, snapshot.state);
      },
      {
        onError: () => {
          if (!hasSnapshot) unsubscribe();
        },
      },
    );
    return unsubscribe;
  }, [client]);

  const send = useCallback(
    (call: (connected: ViewerContractClient) => Promise<unknown>) => {
      if (client === undefined || !isConnectedRef.current) return;
      const previous = queue.current;
      queue.current = (async () => {
        await previous;
        try {
          await call(client);
        } catch {
          // A refused call leaves the session state as it was; the page shows what it loaded either way.
        }
      })();
    },
    [client],
  );

  const publishChart = useCallback(
    (label: SourceLabel, config: AgentLogicConfig) => {
      send((connected) => connected.call('show_chart', { ...label, config }));
    },
    [send],
  );

  const publishSelection = useCallback(
    (path: string | undefined) => {
      send((connected) => connected.call('select_element', path === undefined ? {} : { path }));
    },
    [send],
  );

  return { isConnected, publishChart, publishSelection };
}
