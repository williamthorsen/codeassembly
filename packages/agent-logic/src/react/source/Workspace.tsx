import { type ComponentType, type ReactElement, type ReactNode, useCallback, useMemo, useRef } from 'react';

import type { ConfigDescription, ElementDescription } from '../../layout/describe-config.ts';
import type { AgentLogicConfig, Span } from '../../schema/agent-logic-schema.ts';
import { buildPromptSegments } from '../../source/prompt-segments.ts';
import type { ChartMark } from '../canvas/list-chart-marks.ts';
import { StatechartCanvas, type StatechartCanvasProps } from '../canvas/StatechartCanvas.tsx';
import type { ChartLayout } from '../hooks/useChartLayout.ts';
import { Inspector, type InspectorLinkProps } from '../inspector/Inspector.tsx';
import { PromptPane } from './PromptPane.tsx';
import { SourceLine } from './SourceLine.tsx';

export interface WorkspaceProps {
  config: AgentLogicConfig;
  description: ConfigDescription;
  /** The chart's layout: its elements, why it failed, or `undefined` while it runs. */
  layout: ChartLayout | undefined;
  selectedPath: string | undefined;
  /**
   * The passages that the prompt marks apart from the selection, such as an unconverted passage or a finding's
   * quotes.
   */
  shownPassages: Span[];
  onSelect: (path: string | undefined) => void;
  renderKey: (marks: ReadonlySet<ChartMark>) => ReactNode;
  /** The messages panel, docked at the canvas's bottom edge. */
  messages?: ReactNode;
  /** The app's in-page link, which the inspector renders for each state and transition that it names. */
  LinkButton: ComponentType<InspectorLinkProps>;
  /** The canvas to render, `StatechartCanvas` unless a test replaces it. */
  Canvas?: ComponentType<StatechartCanvasProps> | undefined;
}

/**
 * The canvas above the messages panel, beside the source pane, which holds the inspector above the prompt, joined by
 * the source line. It fills the height that its flex parent leaves, and the app sets its outer spacing.
 */
export function Workspace({
  config,
  description,
  layout,
  selectedPath,
  shownPassages,
  onSelect,
  renderKey,
  messages,
  LinkButton,
  Canvas = StatechartCanvas,
}: WorkspaceProps): ReactElement {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const redrawLineRef = useRef<(() => void) | undefined>(undefined);
  const segments = useMemo(
    () => buildPromptSegments(config.meta.prompt, description, config.meta.unconverted, shownPassages),
    [config, description, shownPassages],
  );
  const selectedElement = findElement(description, selectedPath);
  // Redraw the line directly, because a pan or zoom calls this on every frame.
  const handleViewportChange = useCallback(() => {
    redrawLineRef.current?.();
  }, []);

  return (
    <div ref={workspaceRef} className="statechart-workspace">
      <div className="statechart-workspace__chart">
        <div className="statechart-workspace__canvas">
          {layout !== undefined && 'error' in layout ? (
            <p className="statechart-workspace__error">The layout failed ({layout.error}).</p>
          ) : undefined}
          {layout !== undefined && 'elements' in layout ? (
            <Canvas
              key={layout.key}
              elements={layout.elements}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onViewportChange={handleViewportChange}
              renderKey={renderKey}
            />
          ) : undefined}
        </div>
        {messages}
      </div>
      <div className="statechart-workspace__source">
        <Inspector element={selectedElement} description={description} onSelect={onSelect} LinkButton={LinkButton} />
        {/* The pane fills its parent's height, so its parent takes the height that the inspector leaves. */}
        <div className="statechart-workspace__prompt">
          <PromptPane
            segments={segments}
            selected={selectedElement}
            shownPassages={shownPassages}
            onSelect={onSelect}
          />
        </div>
      </div>
      <SourceLine containerRef={workspaceRef} selectedPath={selectedPath} redrawRef={redrawLineRef} />
    </div>
  );
}

// region | Helpers
/** Returns the described state, transition, or ambient instruction at a path. */
function findElement(description: ConfigDescription, path: string | undefined): ElementDescription | undefined {
  if (path === undefined) return undefined;
  return [...description.states, ...description.transitions, ...description.ambient].find(
    (element) => element.path === path,
  );
}
// endregion | Helpers
