import React from 'react';

import type { DemoRecording } from '../demo/index.js';
import type { PlaybackControls, PlaybackState } from '../playback/playback-controller.js';

import './DemoControlPanel.css';

interface DemoControlPanelProps {
  recordings: DemoRecording[];
  activeRecording: DemoRecording | null;
  playbackState: PlaybackState;
  speed: number;
  cursor: number;
  snapshotCount: number;
  controls: PlaybackControls;
  onSelectRecording: (recording: DemoRecording) => void;
  onStop: () => void;
}

export function DemoControlPanel({
  recordings,
  activeRecording,
  playbackState,
  speed,
  cursor,
  snapshotCount,
  controls,
  onSelectRecording,
  onStop,
}: DemoControlPanelProps): React.JSX.Element {
  function handleRecordingChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const selected = recordings.find((r) => r.name === e.target.value);
    if (selected) {
      onSelectRecording(selected);
    }
  }

  const displayPosition = cursor === -1 ? 0 : cursor + 1;

  return (
    <div className="demo-control-panel">
      <select value={activeRecording?.name ?? ''} onChange={handleRecordingChange} aria-label="Select recording">
        <option value="">Select recording...</option>
        {recordings.map((r) => (
          <option key={r.name} value={r.name}>
            {r.name}
          </option>
        ))}
      </select>

      <div className="demo-transport-row">
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

      <span className="demo-position">
        {displayPosition} / {snapshotCount}
      </span>

      <div className="demo-speed-row">
        <button onClick={() => controls.slower()} aria-label="Slower">
          -
        </button>
        <span className="demo-speed-display">{speed}x</span>
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
