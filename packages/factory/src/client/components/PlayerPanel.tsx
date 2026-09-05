import React from 'react';

import type { PlaybackControls, PlaybackState } from '../playback/playback-controller.ts';

import './PlayerPanel.css';

export interface PlayerPanelProps {
  label: string;
  playbackState: PlaybackState;
  speed: number;
  cursor: number;
  snapshotCount: number;
  controls: PlaybackControls;
  onStop: () => void;
}

/** Transport controls panel for playback — shared between demo and run replay modes. */
export function PlayerPanel({
  label,
  playbackState,
  speed,
  cursor,
  snapshotCount,
  controls,
  onStop,
}: PlayerPanelProps): React.JSX.Element {
  const displayPosition = cursor === -1 ? 0 : cursor + 1;

  return (
    <div className="player-panel">
      <span className="player-panel-label">{label}</span>

      <div className="player-transport-row">
        <button onClick={() => controls.stepBackward()} aria-label="Step back">
          &lt;&lt;
        </button>
        {playbackState === 'playing' ? (
          <button onClick={() => controls.pause()} aria-label="Pause">
            ||
          </button>
        ) : (
          <button onClick={() => controls.play()} aria-label="Play">
            &gt;
          </button>
        )}
        <button onClick={() => controls.stepForward()} aria-label="Step forward">
          &gt;&gt;
        </button>
        <button onClick={onStop} aria-label="Stop">
          Stop
        </button>
      </div>

      <span className="player-position">
        {displayPosition} / {snapshotCount}
      </span>

      <div className="player-speed-row">
        <button onClick={() => controls.slower()} aria-label="Slower">
          -
        </button>
        <span className="player-speed-display">{speed}x</span>
        <button onClick={() => controls.faster()} aria-label="Faster">
          +
        </button>
        <button onClick={() => controls.resetSpeed()} aria-label="Reset speed">
          1x
        </button>
      </div>
    </div>
  );
}
