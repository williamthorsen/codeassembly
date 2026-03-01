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
    setNormalized: vi.fn(),
  };
}

function createRecordings(): DemoRecording[] {
  return [
    {
      name: 'Simple run',
      description: 'A simple run',
      header: {
        runId: 'r1',
        projectSlug: 'test',
        ticketId: undefined,
        projectRoot: '/test',
        branch: 'main',
        task: 'test',
        startedAt: '2026-01-01T00:00:00Z',
        externalPlan: false,
        mergeBaseSha: undefined,
        diffBase: undefined,
        maxReviewRounds: undefined,
        fixLowFindings: undefined,
        mode: undefined,
        model: undefined,
      },
      events: [],
    },
    {
      name: 'Complex run',
      description: 'A complex run',
      header: {
        runId: 'r2',
        projectSlug: 'test',
        ticketId: undefined,
        projectRoot: '/test',
        branch: 'main',
        task: 'test',
        startedAt: '2026-01-01T00:00:00Z',
        externalPlan: false,
        mergeBaseSha: undefined,
        diffBase: undefined,
        maxReviewRounds: undefined,
        fixLowFindings: undefined,
        mode: undefined,
        model: undefined,
      },
      events: [],
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
        eventCount={10}
        normalized={true}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={() => {}}
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
        eventCount={10}
        normalized={true}
        controls={createControls()}
        onSelectRecording={handleSelect}
        onStop={() => {}}
        onToggleNormalized={() => {}}
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
        eventCount={10}
        normalized={true}
        controls={controls}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={() => {}}
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
        eventCount={10}
        normalized={true}
        controls={controls}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={() => {}}
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
        eventCount={10}
        normalized={true}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={handleStop}
        onToggleNormalized={() => {}}
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
        eventCount={10}
        normalized={true}
        controls={controls}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={() => {}}
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
        eventCount={10}
        normalized={true}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={() => {}}
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
        eventCount={18}
        normalized={true}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={() => {}}
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
        eventCount={10}
        normalized={true}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={() => {}}
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
        eventCount={10}
        normalized={true}
        controls={controls}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Slower'));
    expect(controls.slower).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Faster'));
    expect(controls.faster).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Reset speed'));
    expect(controls.resetSpeed).toHaveBeenCalledTimes(1);
  });

  it('normalization checkbox calls onToggleNormalized', () => {
    const handleToggle = vi.fn();
    render(
      <DemoControlPanel
        recordings={createRecordings()}
        activeRecording={null}
        playbackState="stopped"
        speed={1}
        cursor={-1}
        eventCount={10}
        normalized={true}
        controls={createControls()}
        onSelectRecording={() => {}}
        onStop={() => {}}
        onToggleNormalized={handleToggle}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
