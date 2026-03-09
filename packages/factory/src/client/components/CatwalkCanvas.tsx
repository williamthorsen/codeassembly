import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { useContainerResize } from '../hooks/useContainerResize.js';
import { ENGINE_HEIGHT, ENGINE_WIDTH } from '../visualizations/catwalk/constants/dimensions.js';
import { CatwalkScene } from '../visualizations/catwalk/scene/CatwalkScene.js';

import './GameCanvas.css';

interface CatwalkCanvasProps {
  status: CanonicalRunStatus;
}

/** Renders the catwalk visualization by managing an Excalibur engine lifecycle tied to a canvas element. */
export function CatwalkCanvas({ status }: CatwalkCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const initializedRef = useRef(false);
  const startFailedRef = useRef(false);

  useContainerResize(canvasRef, engineRef);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine({
      canvasElement: canvasRef.current,
      width: ENGINE_WIDTH,
      height: ENGINE_HEIGHT,
      displayMode: DisplayMode.FitContainer,
    });

    const scene = new CatwalkScene(status);
    engine.addScene('catwalk', scene);
    void engine.goToScene('catwalk');

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
        console.warn('CatwalkCanvas: status update dropped because engine failed to start');
      }
      return;
    }
    const scene = engineRef.current.scenes.catwalk;
    if (scene instanceof CatwalkScene) {
      scene.updateStatus(status);
    }
  }, [status]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
