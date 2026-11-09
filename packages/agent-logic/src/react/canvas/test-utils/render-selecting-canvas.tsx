import { render, type RenderResult } from '@testing-library/react';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { type ReactElement, useState } from 'react';
import { vi } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import { type FlowElements, toFlowElements } from '../../../layout/to-flow-elements.ts';
import type { AgentLogicConfig } from '../../../schema/agent-logic-schema.ts';
import { StatechartCanvas } from '../StatechartCanvas.tsx';

/**
 * Renders the canvas for a config laid out as `layout`, holding the selection in state as the app does. With
 * `delayMs`, each reported selection reaches that state that many milliseconds late.
 */
export function renderSelectingCanvas(
  config: AgentLogicConfig,
  layout: ElkNode,
  delayMs?: number,
): RenderResult & {
  onSelect: ReturnType<typeof vi.fn<(path: string | undefined) => void>>;
  readSelectedPath: () => string | undefined;
} {
  const onSelect = vi.fn<(path: string | undefined) => void>();
  const elements = toFlowElements(describeConfig(config), layout);
  const shown: { path: string | undefined } = { path: undefined };

  function SelectingCanvas({ elements: canvasElements }: { elements: FlowElements }): ReactElement {
    const [selectedPath, setSelectedPath] = useState<string | undefined>();
    shown.path = selectedPath;
    return (
      <StatechartCanvas
        elements={canvasElements}
        selectedPath={selectedPath}
        onSelect={(path) => {
          onSelect(path);
          if (delayMs === undefined) setSelectedPath(path);
          else setTimeout(() => setSelectedPath(path), delayMs);
        }}
      />
    );
  }

  return {
    ...render(<SelectingCanvas elements={elements} />),
    onSelect,
    readSelectedPath: () => shown.path,
  };
}
