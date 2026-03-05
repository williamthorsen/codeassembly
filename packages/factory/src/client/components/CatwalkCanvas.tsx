import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { CatwalkScene } from '../visualizations/catwalk/scene/CatwalkScene.js';

import './GameCanvas.css';

interface CatwalkCanvasProps {
  status: CanonicalRunStatus;
}

export function CatwalkCanvas({ status }: CatwalkCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine({
      canvasElement: canvasRef.current,
      width: 1200,
      height: 600,
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
      const scene = engineRef.current.scenes.catwalk;
      if (scene instanceof CatwalkScene) {
        scene.updateStatus(status);
      }
    }
  }, [status]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
