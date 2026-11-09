import { render, type RenderResult } from '@testing-library/react';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { vi } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import { toFlowElements } from '../../../layout/to-flow-elements.ts';
import type { AgentLogicConfig } from '../../../schema/agent-logic-schema.ts';
import { StatechartCanvas, type StatechartCanvasProps } from '../StatechartCanvas.tsx';

/**
 * Renders the canvas for a config laid out as `layout`, with a selection, a spy for selection, and a way to change the
 * selection from outside the canvas; its flows show their preambles when `showAmbient` is set, and `renderKey` draws
 * its key.
 */
export function renderCanvas(
  config: AgentLogicConfig,
  layout: ElkNode,
  selectedPath?: string,
  { renderKey, showAmbient = false }: Pick<StatechartCanvasProps, 'renderKey'> & { showAmbient?: boolean } = {},
): RenderResult & {
  onSelect: ReturnType<typeof vi.fn<(path: string | undefined) => void>>;
  selectFromOutside: (path: string | undefined) => void;
} {
  const onSelect = vi.fn<(path: string | undefined) => void>();
  const elements = toFlowElements(describeConfig(config), layout, { showAmbient });
  const result = render(
    <StatechartCanvas elements={elements} selectedPath={selectedPath} onSelect={onSelect} renderKey={renderKey} />,
  );
  return {
    ...result,
    onSelect,
    selectFromOutside: (path) => {
      result.rerender(
        <StatechartCanvas elements={elements} selectedPath={path} onSelect={onSelect} renderKey={renderKey} />,
      );
    },
  };
}
