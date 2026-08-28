import type { CanonicalRunStatus } from 'codeassembly-run-core';
import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef } from 'react';

import { useContainerResize } from '../hooks/useContainerResize.js';
import { ENGINE_HEIGHT, ENGINE_WIDTH } from '../visualizations/factory-floor/constants/dimensions.js';
import { FactoryFloorScene } from '../visualizations/factory-floor/scene/FactoryFloorScene.js';

import './canvas.css';

interface FactoryFloorCanvasProps {
  status: CanonicalRunStatus;
}

/** Renders the factory-floor visualization by managing an Excalibur engine lifecycle tied to a canvas element. */
export function FactoryFloorCanvas({ status }: FactoryFloorCanvasProps): React.JSX.Element {
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

    const scene = new FactoryFloorScene(status);
    engine.addScene('factory-floor', scene);
    void engine.goToScene('factory-floor').catch((error: unknown) => {
      startFailedRef.current = true;
      console.error('Failed to go to factory-floor scene:', error);
    });

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

  useEffect(() => {
    if (!engineRef.current || !initializedRef.current) {
      if (startFailedRef.current) {
        console.warn('FactoryFloorCanvas: status update dropped because engine failed to start');
      }
      return;
    }
    const scene = engineRef.current.scenes['factory-floor'];
    if (scene instanceof FactoryFloorScene) {
      scene.updateStatus(status);
    }
  }, [status]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
