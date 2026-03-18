import { useCallback, useEffect, useRef, useState } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import type { PlaybackControls, PlaybackSource, PlaybackState } from '../playback/playback-controller.js';
import { PlaybackController } from '../playback/playback-controller.js';

export interface UsePlaybackResult {
  data: CanonicalRunStatus | null;
  playbackState: PlaybackState;
  controls: PlaybackControls;
  speed: number;
  cursor: number;
  snapshotCount: number;
}

const noopControls: PlaybackControls = {
  play() {},
  pause() {},
  stop() {},
  stepForward() {},
  stepBackward() {},
  faster() {},
  slower() {},
  resetSpeed() {},
  setSpeed() {},
};

export function usePlayback(source: PlaybackSource | null): UsePlaybackResult {
  const [data, setData] = useState<CanonicalRunStatus | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [speed, setSpeed] = useState(1);
  const [cursor, setCursor] = useState(-1);
  const controllerRef = useRef<PlaybackController | null>(null);

  useEffect(() => {
    if (!source) {
      controllerRef.current = null;
      setData(null);
      setPlaybackState('stopped');
      setSpeed(1);
      setCursor(-1);
      return;
    }

    const controller = new PlaybackController(source.snapshots, (status) => {
      setData(status);
      setPlaybackState(controller.state);
      setSpeed(controller.speed);
      setCursor(controller.cursor);
    });
    controllerRef.current = controller;

    return () => {
      controller.dispose();
    };
  }, [source]);

  const play = useCallback(() => {
    controllerRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    controllerRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.stop();
    setPlaybackState('stopped');
    setCursor(-1);
  }, []);

  const stepForward = useCallback(() => {
    controllerRef.current?.stepForward();
  }, []);

  const stepBackward = useCallback(() => {
    controllerRef.current?.stepBackward();
  }, []);

  const faster = useCallback(() => {
    controllerRef.current?.faster();
    if (controllerRef.current) {
      setSpeed(controllerRef.current.speed);
    }
  }, []);

  const slower = useCallback(() => {
    controllerRef.current?.slower();
    if (controllerRef.current) {
      setSpeed(controllerRef.current.speed);
    }
  }, []);

  const resetSpeed = useCallback(() => {
    controllerRef.current?.resetSpeed();
    setSpeed(1);
  }, []);

  const setSpeedValue = useCallback((n: number) => {
    controllerRef.current?.setSpeed(n);
    if (controllerRef.current) {
      setSpeed(controllerRef.current.speed);
    }
  }, []);

  const controls: PlaybackControls = source
    ? {
        play,
        pause,
        stop,
        stepForward,
        stepBackward,
        faster,
        slower,
        resetSpeed,
        setSpeed: setSpeedValue,
      }
    : noopControls;

  return {
    data,
    playbackState,
    controls,
    speed,
    cursor,
    snapshotCount: source?.snapshots.length ?? 0,
  };
}
