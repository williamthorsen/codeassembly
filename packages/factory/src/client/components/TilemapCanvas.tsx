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
 * Renders the tilemap visualization by managing an Excalibur engine lifecycle
 * tied to a canvas element. Forwards run status updates to the scene.
 */
export function TilemapCanvas({ status }: TilemapCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<TilemapScene | null>(null);
  const initializedRef = useRef(false);

  useContainerResize(canvasRef, engineRef);

  // Engine lifecycle
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
    sceneRef.current = scene;

    void engine.goToScene('tilemap').catch((error: unknown) => {
      console.error('Failed to go to tilemap scene:', error);
    });

    void engine
      .start()
      .then(() => {
        initializedRef.current = true;
        // Apply initial status once engine is ready
        scene.updateStatus(status);
        return;
      })
      .catch((error: unknown) => {
        console.error('Failed to start Excalibur engine:', error);
      });

    engineRef.current = engine;

    return () => {
      initializedRef.current = false;
      sceneRef.current = null;
      engine.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Forward status updates to the scene
  useEffect(() => {
    if (initializedRef.current && sceneRef.current) {
      sceneRef.current.updateStatus(status);
    }
  }, [status]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
