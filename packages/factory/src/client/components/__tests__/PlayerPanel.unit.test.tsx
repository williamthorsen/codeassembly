import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlaybackControls } from '../../playback/playback-controller.ts';

vi.mock('../PlayerPanel.css', () => ({}));

const { PlayerPanel } = await import('../PlayerPanel.tsx');

function createControls(): PlaybackControls {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    stepForward: vi.fn(),
    stepBackward: vi.fn(),
    faster: vi.fn(),
    slower: vi.fn(),
    resetSpeed: vi.fn(),
    setSpeed: vi.fn(),
  };
}

describe(PlayerPanel, () => {
  afterEach(() => {
    cleanup();
  });

  it('displays the source label', () => {
    render(
      <PlayerPanel
        label="My run"
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onStop={() => {}}
      />,
    );

    expect(screen.getByText('My run')).toBeInTheDocument();
  });

  it('play button calls controls.play when stopped', () => {
    const controls = createControls();
    render(
      <PlayerPanel
        label="Test"
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={controls}
        onStop={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Play'));
    expect(controls.play).toHaveBeenCalledTimes(1);
  });

  it('pause button calls controls.pause when playing', () => {
    const controls = createControls();
    render(
      <PlayerPanel
        label="Test"
        playbackState="playing"
        speed={1}
        cursor={2}
        snapshotCount={10}
        controls={controls}
        onStop={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Pause'));
    expect(controls.pause).toHaveBeenCalledTimes(1);
  });

  it('stop button calls onStop', () => {
    const handleStop = vi.fn();
    render(
      <PlayerPanel
        label="Test"
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onStop={handleStop}
      />,
    );

    fireEvent.click(screen.getByLabelText('Stop'));
    expect(handleStop).toHaveBeenCalledTimes(1);
  });

  it('step-back and step-forward call respective control functions', () => {
    const controls = createControls();
    render(
      <PlayerPanel
        label="Test"
        playbackState="paused"
        speed={1}
        cursor={3}
        snapshotCount={10}
        controls={controls}
        onStop={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Step back'));
    expect(controls.stepBackward).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Step forward'));
    expect(controls.stepForward).toHaveBeenCalledTimes(1);
  });

  it('displays current speed', () => {
    render(
      <PlayerPanel
        label="Test"
        playbackState="stopped"
        speed={2}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onStop={() => {}}
      />,
    );

    expect(screen.getByText('2x')).toBeInTheDocument();
  });

  it('displays position indicator', () => {
    render(
      <PlayerPanel
        label="Test"
        playbackState="paused"
        speed={1}
        cursor={2}
        snapshotCount={18}
        controls={createControls()}
        onStop={() => {}}
      />,
    );

    expect(screen.getByText('3 / 18')).toBeInTheDocument();
  });

  it('displays 0 / N when cursor is -1', () => {
    render(
      <PlayerPanel
        label="Test"
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onStop={() => {}}
      />,
    );

    expect(screen.getByText('0 / 10')).toBeInTheDocument();
  });

  it('speed buttons call correct control functions', () => {
    const controls = createControls();
    render(
      <PlayerPanel
        label="Test"
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={controls}
        onStop={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Slower'));
    expect(controls.slower).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Faster'));
    expect(controls.faster).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Reset speed'));
    expect(controls.resetSpeed).toHaveBeenCalledTimes(1);
  });
});
