import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { FactoryScene } from '../game/scenes/FactoryScene.js';
import { loadAllSprites } from '../game/sprites/agent-sprite-loader.js';

import './GameCanvas.css';

interface GameCanvasProps {
  status: CanonicalRunStatus;
}

export function GameCanvas({ status }: GameCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine({
      canvasElement: canvasRef.current,
      width: 1200,
      height: 600,
      displayMode: DisplayMode.FitScreen,
    });

    const scene = new FactoryScene(status);
    engine.addScene('factory', scene);
    void engine.goToScene('factory');

    loadAllSprites();

    void engine
      .start()
      .then(() => {
        initializedRef.current = true;
        return;
      })
      .catch((error: unknown) => {
        console.error('Failed to start Excalibur engine:', error);
      });

    engineRef.current = engine;

    return () => {
      initializedRef.current = false;
      engine.stop();
    };
  }, []);

  // Update scene when status changes (skip if engine not yet initialized)
  useEffect(() => {
    if (engineRef.current && initializedRef.current) {
      const scene = engineRef.current.scenes.factory;
      if (scene instanceof FactoryScene) {
        scene.updateStatus(status);
      }
    }
  }, [status]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
