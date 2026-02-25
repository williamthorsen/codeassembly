import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { FactoryScene } from '../game/scenes/FactoryScene.js';

import './GameCanvas.css';

interface GameCanvasProps {
  status: CanonicalRunStatus;
}

export function GameCanvas({ status }: GameCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

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
    engine.start().catch((error: unknown) => {
      console.error('Failed to start Excalibur engine:', error);
    });

    engineRef.current = engine;

    return () => {
      engine.stop();
    };
  }, []);

  // Update scene when status changes
  useEffect(() => {
    if (engineRef.current) {
      const scene = engineRef.current.scenes.factory;
      if (scene instanceof FactoryScene) {
        scene.updateStatus(status);
      }
    }
  }, [status]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
