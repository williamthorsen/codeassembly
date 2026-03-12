import { useCallback, useState } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import type { DemoRecording } from '../demo/index.js';
import { DEMO_RECORDINGS } from '../demo/index.js';
import type { PlaybackControls, PlaybackState } from '../playback/playback-controller.js';
import { usePlayback } from './usePlayback.js';

export interface UseDemoModeResult {
  isActive: boolean;
  activeRecording: DemoRecording | null;
  data: CanonicalRunStatus | null;
  playbackState: PlaybackState;
  controls: PlaybackControls;
  speed: number;
  cursor: number;
  snapshotCount: number;
  recordings: DemoRecording[];
  loadRecording: (recording: DemoRecording) => void;
  stopDemo: () => void;
}

export function useDemoMode(): UseDemoModeResult {
  const [activeRecording, setActiveRecording] = useState<DemoRecording | null>(null);
  const playback = usePlayback(activeRecording);

  const loadRecording = useCallback((recording: DemoRecording) => {
    setActiveRecording(recording);
  }, []);

  const stopDemo = useCallback(() => {
    setActiveRecording(null);
  }, []);

  return {
    isActive: activeRecording !== null,
    activeRecording,
    data: playback.data,
    playbackState: playback.playbackState,
    controls: playback.controls,
    speed: playback.speed,
    cursor: playback.cursor,
    snapshotCount: playback.snapshotCount,
    recordings: DEMO_RECORDINGS,
    loadRecording,
    stopDemo,
  };
}
