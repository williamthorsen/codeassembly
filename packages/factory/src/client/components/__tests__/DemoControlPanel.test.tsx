import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DemoRecording } from '../../demo/index.js';
import type { PlaybackControls } from '../../playback/playback-controller.js';

vi.mock('../DemoControlPanel.css', () => ({}));

const { DemoControlPanel } = await import('../DemoControlPanel.js');

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

function createRecordings(): DemoRecording[] {
  return [
    {
      name: 'Simple run',
      description: 'A simple run',
      snapshots: [],
    },
    {
      name: 'Complex run',
      description: 'A complex run',
      snapshots: [],
    },
  ];
}

describe('DemoControlPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all recordings in the selector', () => {
    const recordings = createRecordings();
    render(
      <DemoControlPanel
        recordings={recordings}
        activeRecording={null}
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
      />,
    );

    const select = screen.getByLabelText('Select recording');
    const options = within(select).getAllByRole('option');
    // +1 for the placeholder option
    expect(options).toHaveLength(3);
    expect(options[1]?.textContent).toBe('Simple run');
    expect(options[2]?.textContent).toBe('Complex run');
  });

  it('selecting a recording calls onSelectRecording with the correct object', () => {
    const recordings = createRecordings();
    const handleSelect = vi.fn();
    render(
      <DemoControlPanel
        recordings={recordings}
        activeRecording={recordings[0] ?? null}
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onSelectRecording={handleSelect}
        onStop={() => {}}
      />,
    );

    const select = screen.getByLabelText('Select recording');
    fireEvent.change(select, { target: { value: 'Complex run' } });

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(recordings[1]);
  });

  it('play button calls controls.play when stopped', () => {
    const controls = createControls();
    render(
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={controls}
        onSelectRecording={() => {}}
        onStop={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Play'));
    expect(controls.play).toHaveBeenCalledTimes(1);
  });

  it('pause button calls controls.pause when playing', () => {
    const controls = createControls();
    render(
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="playing"
        speed={1}
        cursor={2}
        snapshotCount={10}
        controls={controls}
        onSelectRecording={() => {}}
        onStop={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Pause'));
    expect(controls.pause).toHaveBeenCalledTimes(1);
  });

  it('stop button calls onStop', () => {
    const handleStop = vi.fn();
    render(
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={handleStop}
      />,
    );

    fireEvent.click(screen.getByLabelText('Stop'));
    expect(handleStop).toHaveBeenCalledTimes(1);
  });

  it('step-back and step-forward call respective control functions', () => {
    const controls = createControls();
    render(
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="paused"
        speed={1}
        cursor={3}
        snapshotCount={10}
        controls={controls}
        onSelectRecording={() => {}}
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
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="stopped"
        speed={2}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
      />,
    );

    expect(screen.getByText('2x')).toBeInTheDocument();
  });

  it('displays position indicator', () => {
    render(
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="paused"
        speed={1}
        cursor={2}
        snapshotCount={18}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
      />,
    );

    expect(screen.getByText('3 / 18')).toBeInTheDocument();
  });

  it('displays 0 / N when cursor is -1', () => {
    render(
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
      />,
    );

    expect(screen.getByText('0 / 10')).toBeInTheDocument();
  });

  it('speed buttons call correct control functions', () => {
    const controls = createControls();
    render(
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="stopped"
        speed={1}
        cursor={-1}
        snapshotCount={10}
        controls={controls}
        onSelectRecording={() => {}}
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
