import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef } from 'react';

import { CatwalkScene } from '../visualizations/catwalk/scene/CatwalkScene.js';

import './GameCanvas.css';

export function CatwalkCanvas(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine({
      canvasElement: canvasRef.current,
      width: 1200,
      height: 600,
      displayMode: DisplayMode.FitContainer,
    });

    const scene = new CatwalkScene();
    engine.addScene('catwalk', scene);
    void engine.goToScene('catwalk').catch((error: unknown) => {
      console.error('Failed to navigate to catwalk scene:', error);
    });

    void engine.start().catch((error: unknown) => {
      console.error('Failed to start Excalibur engine:', error);
    });

    return () => {
      engine.stop();
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
