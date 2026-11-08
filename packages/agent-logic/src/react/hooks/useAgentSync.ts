import { useCallback, useRef } from 'react';

import { describeConfig } from '../../layout/describe-config.ts';
import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import { describeAgentSelection } from './describe-agent-selection.ts';
import { describeLoadedByAgent } from './describe-load-outcome.ts';
import { findExampleInSearch } from './example-location.ts';
import type { SourceLabel } from './label-source.ts';
import { useAgentBridge, type ViewerContractClient, type ViewerState } from './useAgentBridge.ts';

/** The page's operations that apply the agent's commits; the hook reads them when a commit arrives. */
export interface AgentSyncPage {
  announce: (text: string) => void;
  /** Returns the chart that the page shows, if any. */
  readChart: () => (SourceLabel & { config: AgentLogicConfig }) | undefined;
  /** Shows a chart without a history entry. */
  showChart: (label: SourceLabel, config: AgentLogicConfig) => void;
  /** Shows a chart with a history entry of its own, as a conversion does. */
  showLoadedInput: (label: SourceLabel, config: AgentLogicConfig) => void;
  /** Selects an element, or clears the selection, and clears any passages shown. */
  selectElement: (path: string | undefined) => void;
}

/** The page's link to the agent: whether it is connected, and the publishers that skip a commit being applied. */
export interface AgentSync {
  isConnected: boolean;
  publishChart: (label: SourceLabel, config: AgentLogicConfig) => void;
  publishSelection: (path: string | undefined) => void;
}

/**
 * Keeps the page and the session state that it shares with an agent in step: applies and announces the agent's
 * commits through the page's operations, and on connect adopts the session's chart when the page shows none, else
 * publishes the page's chart, which wins. A change made while a commit is applied is not published back.
 */
export function useAgentSync(client: ViewerContractClient | undefined, page: AgentSyncPage): AgentSync {
  const isApplying = useRef(false);

  const bridge = useAgentBridge(client, {
    onConnect: (state) => {
      const pageChart = page.readChart();
      if (pageChart !== undefined) {
        bridge.publishChart(toLabel(pageChart), pageChart.config);
        return;
      }
      const { chart } = state;
      if (chart === undefined || findExampleInSearch(globalThis.location.search) !== undefined) return;
      applying(() => page.showChart(toLabel(chart), chart.config));
    },
    onAgentChange: (action, state) => {
      applying(() => applyAgentChange(page, action, state));
    },
  });

  /** Runs a change that applies the agent's commit without publishing it back. */
  function applying(change: () => void): void {
    isApplying.current = true;
    try {
      change();
    } finally {
      isApplying.current = false;
    }
  }

  const { isConnected, publishChart: sendChart, publishSelection: sendSelection } = bridge;
  const publishChart = useCallback(
    (label: SourceLabel, config: AgentLogicConfig) => {
      if (!isApplying.current) sendChart(label, config);
    },
    [sendChart],
  );
  const publishSelection = useCallback(
    (path: string | undefined) => {
      if (!isApplying.current) sendSelection(path);
    },
    [sendSelection],
  );

  return { isConnected, publishChart, publishSelection };
}

// region | Helpers
/** Applies a commit that the agent made, by the action that made it, and announces it. */
function applyAgentChange(page: AgentSyncPage, action: string, state: ViewerState): void {
  switch (action) {
    case 'load_chart':
    case 'show_chart': {
      if (state.chart === undefined) return;
      const { config } = state.chart;
      page.showLoadedInput(toLabel(state.chart), config);
      page.announce(describeLoadedByAgent(state.chart.source, config));
      return;
    }
    case 'select_element': {
      const pageChart = page.readChart();
      if (pageChart === undefined) return;
      const text = describeAgentSelection(describeConfig(pageChart.config), state.selectedPath);
      // Ignore a path that this tab's chart does not contain, as when another tab loaded a different chart.
      if (text === undefined) return;
      page.selectElement(state.selectedPath);
      page.announce(text);
      return;
    }
    case 'save_prompt':
      if (state.savedPrompt !== undefined) page.announce(`Agent saved ${state.savedPrompt.fileName}.`);
      return;
  }
}

/** Returns the source label of a chart. */
function toLabel({ source, downloadName }: SourceLabel): SourceLabel {
  return { source, downloadName };
}
// endregion | Helpers
