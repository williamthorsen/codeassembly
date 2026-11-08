import { describeError } from '@williamthorsen/toolbelt.errors';
import { useEffect, useState } from 'react';

import type { FlowElements } from '../../layout/to-flow-elements.ts';
import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';

/** A chart's layout, or why it failed, under the key of the load that it belongs to. */
export type ChartLayout = { key: number; elements: FlowElements } | { key: number; error: string };

/**
 * Lays out the shown chart again whenever it or the preamble setting changes, keeping the previous layout until the
 * new one is ready, and calls `onFail` when a layout fails.
 */
export function useChartLayout({
  chart,
  layout,
  showAmbient,
  onFail,
}: {
  chart: { key: number; config: AgentLogicConfig } | undefined;
  layout: (config: AgentLogicConfig, options: { showAmbient: boolean }) => Promise<FlowElements>;
  showAmbient: boolean;
  onFail: () => void;
}): ChartLayout | undefined {
  const [laidOut, setLaidOut] = useState<ChartLayout | undefined>();

  useEffect(() => {
    if (chart === undefined) return;
    const { config, key } = chart;
    let isCurrent = true;
    void runLayout();
    return () => {
      isCurrent = false;
    };

    async function runLayout(): Promise<void> {
      try {
        const elements = await layout(config, { showAmbient });
        if (isCurrent) setLaidOut({ key, elements });
      } catch (error) {
        if (!isCurrent) return;
        setLaidOut({ key, error: describeError(error) });
        onFail();
      }
    }
  }, [chart, layout, onFail, showAmbient]);

  return chart !== undefined && laidOut?.key === chart.key ? laidOut : undefined;
}
