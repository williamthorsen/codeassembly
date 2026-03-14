import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { useContainerResize } from '../hooks/useContainerResize.js';
import { ENGINE_HEIGHT, ENGINE_WIDTH } from '../visualizations/tilemap/constants/dimensions.js';
import { TilemapScene } from '../visualizations/tilemap/scene/TilemapScene.js';

import './canvas.css';

interface TilemapCanvasProps {
  status: CanonicalRunStatus;
}

/**
 * Renders the tilemap visualization by managing an Excalibur engine lifecycle tied to a canvas element.
 * For Phase 1 the scene is static — the status prop is accepted but not used.
 */
export function TilemapCanvas({ status: _status }: TilemapCanvasProps): React.JSX.Element {
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

    const scene = new TilemapScene();
    engine.addScene('tilemap', scene);
    void engine.goToScene('tilemap').catch((error: unknown) => {
      startFailedRef.current = true;
      console.error('Failed to go to tilemap scene:', error);
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

  return <canvas ref={canvasRef} className="game-canvas" />;
}
