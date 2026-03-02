import { DisplayMode, Engine } from 'excalibur';
import React, { useEffect, useRef, useState } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import type { ArtifactHoverEvent } from '../game/scenes/FactoryScene.js';
import { FactoryScene } from '../game/scenes/FactoryScene.js';
import { loadAllSprites } from '../game/sprites/agent-sprite-loader.js';
import { ArtifactTooltip } from './ArtifactTooltip.js';

import './GameCanvas.css';

interface GameCanvasProps {
  status: CanonicalRunStatus;
}

export function GameCanvas({ status }: GameCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const initializedRef = useRef(false);
  const [hover, setHover] = useState<ArtifactHoverEvent | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine({
      canvasElement: canvasRef.current,
      width: 1200,
      height: 600,
      displayMode: DisplayMode.FitContainer,
    });

    const scene = new FactoryScene(status, setHover);
    engine.addScene('factory', scene);
    void engine.goToScene('factory');

    void loadAllSprites()
      .then(() => engine.start())
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

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
      {hover !== null && (
        <ArtifactTooltip
          type={hover.type}
          {...(hover.tooltip === undefined ? {} : { tooltip: hover.tooltip })}
          pageX={hover.pageX}
          pageY={hover.pageY}
        />
      )}
    </>
  );
}
