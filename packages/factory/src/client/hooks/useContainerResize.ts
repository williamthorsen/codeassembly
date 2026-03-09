import { useEffect } from 'react';

/** Minimal engine shape required by the resize hook -- the full Excalibur Engine satisfies this. */
export interface ResizableEngine {
  screen: unknown;
}

interface ScreenWithResizeHandler {
  _resizeHandler: () => void;
}

/** Returns true if the engine screen exposes Excalibur's internal resize handler. */
function hasResizeHandler(screen: unknown): screen is ScreenWithResizeHandler {
  return typeof screen === 'object' && screen !== null && '_resizeHandler' in screen;
}

/**
 * Observes the canvas container for size changes and triggers Excalibur's screen resize.
 *
 * Excalibur's DisplayMode.FitContainer recalculates canvas scaling when the container
 * resizes, but fixed pixel dimensions set on the canvas by previous calculations can
 * prevent the container from growing. This hook adds a ResizeObserver on the container
 * that resets the canvas to fluid CSS sizing before invoking Excalibur's resize handler,
 * allowing the container to expand and the engine to recalculate scaling correctly.
 */
export function useContainerResize(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  engineRef: React.RefObject<ResizableEngine | null>,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const engine = engineRef.current;
      if (!engine) return;

      // Reset canvas inline dimensions so the container can grow to its
      // CSS-defined size. Without this, Excalibur's previously set pixel
      // values on the canvas prevent the container from expanding.
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      // Invoke Excalibur's internal resize handler, which reads the
      // container's current dimensions and recalculates viewport scaling.
      if (hasResizeHandler(engine.screen)) {
        engine.screen._resizeHandler();
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [canvasRef, engineRef]);
}
