import { describeError } from '@williamthorsen/toolbelt.errors';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchRunEvents } from '../api/client.js';
import { generateSnapshots } from '../playback/generate-snapshots.js';
import type { PlaybackSource } from '../playback/playback-controller.js';
import type { UsePlaybackResult } from './usePlayback.js';
import { usePlayback } from './usePlayback.js';

export interface UseRunPlaybackResult extends UsePlaybackResult {
  startReplay: () => void;
  stopReplay: () => void;
  isActive: boolean;
  error: string | null;
}

interface LoadedSourceMeta {
  projectSlug: string;
  runId: string;
}

/** Hook that fetches raw run events, generates snapshots, and drives playback for real runs. */
export function useRunPlayback(projectSlug: string | null, runId: string | null): UseRunPlaybackResult {
  const [activeSource, setActiveSource] = useState<PlaybackSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedMetaRef = useRef<LoadedSourceMeta | null>(null);
  const generationRef = useRef(0);
  const autoPlayRef = useRef(false);

  const playback = usePlayback(activeSource);

  // Trigger auto-play after a new source is set and the controller is ready
  useEffect(() => {
    if (!(activeSource && autoPlayRef.current)) {
      return;
    }

    autoPlayRef.current = false;
    playback.controls.play();
  }, [activeSource, playback.controls]);

  const startReplay = useCallback(() => {
    if (!projectSlug || !runId) return;

    // No-op if the same run is already loaded
    const meta = loadedMetaRef.current;
    if (meta && meta.projectSlug === projectSlug && meta.runId === runId) return;

    const wasPlaying = playback.playbackState === 'playing';

    generationRef.current += 1;
    const thisGeneration = generationRef.current;
    setError(null);

    void (async () => {
      try {
        const { header, events } = await fetchRunEvents(projectSlug, runId);

        // Discard stale responses
        if (generationRef.current !== thisGeneration) return;

        const snapshots = generateSnapshots(header, events);
        const source: PlaybackSource = { label: runId, snapshots };

        loadedMetaRef.current = { projectSlug, runId };
        autoPlayRef.current = wasPlaying;
        setActiveSource(source);
      } catch (fetchError: unknown) {
        if (generationRef.current !== thisGeneration) return;
        console.error('Failed to fetch run events for replay:', fetchError);
        setError(describeError(fetchError));
      }
    })();
  }, [projectSlug, runId, playback.playbackState]);

  const stopReplay = useCallback(() => {
    generationRef.current += 1;
    loadedMetaRef.current = null;
    autoPlayRef.current = false;
    setError(null);
    setActiveSource(null);
  }, []);

  return {
    ...playback,
    startReplay,
    stopReplay,
    isActive: activeSource !== null,
    error,
  };
}
