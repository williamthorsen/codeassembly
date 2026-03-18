import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { useContainerResize } from '../hooks/useContainerResize.js';
import { CANVAS_HEIGHT_PX, CANVAS_WIDTH_PX } from '../visualizations/office/constants/dimensions.js';
import { OfficeScene } from '../visualizations/office/scene/OfficeScene.js';

import './canvas.css';

interface OfficeCanvasProps {
  status: CanonicalRunStatus;
}

/** Renders the office visualization by managing an Excalibur engine lifecycle tied to a canvas element. */
export function OfficeCanvas({ status }: OfficeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const initializedRef = useRef(false);
  const startFailedRef = useRef(false);

  useContainerResize(canvasRef, engineRef);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine({
      canvasElement: canvasRef.current,
      width: CANVAS_WIDTH_PX,
      height: CANVAS_HEIGHT_PX,
      displayMode: DisplayMode.FitContainer,
    });

    const scene = new OfficeScene(status);
    engine.addScene('office', scene);
    void engine.goToScene('office');

    void engine
      .start()
      .then(() => {
        initializedRef.current = true;
        return;
      })
      .catch((error: unknown) => {
        startFailedRef.current = true;
        console.error('Failed to start Excalibur engine:', error);
      });

    engineRef.current = engine;

    return () => {
      initializedRef.current = false;
      startFailedRef.current = false;
      engine.stop();
    };
  }, []);

  // Update scene when status changes (skip if engine not yet initialized)
  useEffect(() => {
    if (!engineRef.current || !initializedRef.current) {
      if (startFailedRef.current) {
        console.warn('OfficeCanvas: status update dropped because engine failed to start');
      } else {
        console.debug('OfficeCanvas: status update dropped while engine is initializing');
      }
      return;
    }
    const scene = engineRef.current.scenes.office;
    if (scene instanceof OfficeScene) {
      scene.updateStatus(status);
    }
  }, [status]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
