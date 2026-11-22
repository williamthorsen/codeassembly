import { type ReactElement, type RefObject, useEffect, useState } from 'react';

import { buildConnector, type Connector } from './build-connector.ts';

export interface SourceLineProps {
  /** The workspace that contains the canvas and the prompt pane, over which the line is drawn. */
  containerRef: RefObject<HTMLElement | null>;
  selectedPath: string | undefined;
  /** Receives the function that redraws the line, for the canvas to call whenever it pans or zooms. */
  redrawRef: RefObject<(() => void) | undefined>;
}

/**
 * The line that joins the selected element on the canvas to its passage in the prompt, while both are in view. Its
 * container is positioned, and it holds a `StatechartCanvas` and a `PromptPane`, whose data attributes locate the ends.
 */
export function SourceLine({ containerRef, selectedPath, redrawRef }: SourceLineProps): ReactElement | undefined {
  const [line, setLine] = useState<Connector | undefined>();

  useEffect(() => {
    const container = containerRef.current ?? undefined;
    if (container === undefined) return;
    // Keep the narrowed type for the hoisted function below.
    const workspace: HTMLElement = container;
    let frame = 0;
    function scheduleDraw(): void {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setLine(selectedPath === undefined ? undefined : measureLine(workspace, selectedPath));
      });
    }

    scheduleDraw();
    redrawRef.current = scheduleDraw;
    // Capture, because the prompt's own scroll events do not bubble.
    container.addEventListener('scroll', scheduleDraw, { capture: true });
    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(container);
    return () => {
      redrawRef.current = undefined;
      cancelAnimationFrame(frame);
      container.removeEventListener('scroll', scheduleDraw, { capture: true });
      resizeObserver.disconnect();
    };
  }, [containerRef, redrawRef, selectedPath]);

  if (line === undefined) return undefined;
  return (
    <svg aria-hidden="true" className="statechart-source-line">
      <path d={line.path} fill="none" strokeWidth={2.5} />
      <circle cx={line.start.x} cy={line.start.y} r={4} stroke="none" />
      <circle cx={line.end.x} cy={line.end.y} r={4} stroke="none" />
    </svg>
  );
}

// region | Helpers
/** Reads both ends of the line from the page, or returns `undefined` when either is not rendered. */
function measureLine(container: HTMLElement, path: string): Connector | undefined {
  const canvas = container.querySelector('.statechart-canvas') ?? undefined;
  const element = canvas?.querySelector(`[data-path="${CSS.escape(path)}"]`) ?? undefined;
  const prompt = container.querySelector('[data-prompt-text]') ?? undefined;
  const passage = prompt?.querySelector(`[data-passage-for="${CSS.escape(path)}"]`)?.getClientRects()[0];
  if (canvas === undefined || element === undefined || prompt === undefined || passage === undefined) return undefined;
  const origin = container.getBoundingClientRect();
  return buildConnector({
    start: element.getBoundingClientRect(),
    startBounds: canvas.getBoundingClientRect(),
    end: passage,
    endBounds: prompt.getBoundingClientRect(),
    origin: { x: origin.left, y: origin.top },
  });
}
// endregion | Helpers
