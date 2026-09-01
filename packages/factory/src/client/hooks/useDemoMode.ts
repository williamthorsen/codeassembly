import type { CanonicalRunStatus } from 'codeassembly-run-core';
import { useCallback, useMemo, useState } from 'react';

import { DEMO_RECORDINGS, type DemoRecording } from '../demo/index.js';
import type { PlaybackControls, PlaybackSource, PlaybackState } from '../playback/playback-controller.js';
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

  const source = useMemo<PlaybackSource | null>(
    () => (activeRecording ? { label: activeRecording.name, snapshots: activeRecording.snapshots } : null),
    [activeRecording],
  );

  const playback = usePlayback(source);

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
