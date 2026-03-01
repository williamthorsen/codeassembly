import React from 'react';

import type { PlaybackState } from '../playback/playback-controller.js';

import './DemoStatusLight.css';

interface DemoStatusLightProps {
  playbackState: PlaybackState;
  onClick: () => void;
}

export function DemoStatusLight({ playbackState, onClick }: DemoStatusLightProps): React.JSX.Element {
  return (
    <button
      className={`demo-status-light demo-status-light--${playbackState}`}
      onClick={onClick}
      aria-label={`Demo ${playbackState}`}
    />
  );
}
