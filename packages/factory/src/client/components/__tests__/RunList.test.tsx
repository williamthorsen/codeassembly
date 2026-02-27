import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlatRunInfo } from '../../../shared/types/api.js';

vi.mock('../RunList.css', () => ({}));

const { RunList } = await import('../RunList.js');

function createRuns(): FlatRunInfo[] {
  return [
    { projectSlug: 'alpha', ticketId: 'T-1', runId: 'run-a', status: 'in_progress', startedAt: '2026-01-04T00:00:00Z' },
    { projectSlug: 'alpha', ticketId: 'T-2', runId: 'run-b', status: 'completed', startedAt: '2026-01-03T00:00:00Z' },
    { projectSlug: 'beta', ticketId: 'T-3', runId: 'run-c', status: 'failed', startedAt: '2026-01-02T00:00:00Z' },
    {
      projectSlug: 'gamma',
      ticketId: 'T-4',
      runId: 'run-d',
      status: 'needs_manual_review',
      startedAt: '2026-01-01T00:00:00Z',
    },
  ];
}

describe('RunList', () => {
  const onSelectRun = vi.fn();
  const onDismissRun = vi.fn();
  const onDismissAll = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders run items with correct content', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );
    const view = within(container);

    expect(view.getByText('run-a')).toBeInTheDocument();
    expect(view.getByText('run-b')).toBeInTheDocument();
    expect(view.getByText('run-c')).toBeInTheDocument();
    expect(view.getByText('run-d')).toBeInTheDocument();

    expect(view.getByText('alpha / T-1')).toBeInTheDocument();
    expect(view.getByText('alpha / T-2')).toBeInTheDocument();
    expect(view.getByText('beta / T-3')).toBeInTheDocument();
    expect(view.getByText('gamma / T-4')).toBeInTheDocument();
  });

  it('displays correct status indicator symbols and colors', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );
    const view = within(container);

    // in_progress: ▶ cyan
    const inProgressIndicator = view.getByText('\u25B6');
    expect(inProgressIndicator).toHaveStyle({ color: '#55FFFF' });

    // completed: ✔ green
    const completedIndicator = view.getByText('\u2714');
    expect(completedIndicator).toHaveStyle({ color: '#55FF55' });

    // failed: ✘ red
    const failedIndicator = view.getByText('\u2718');
    expect(failedIndicator).toHaveStyle({ color: '#FF5555' });

    // needs_manual_review: ⚠ yellow
    const reviewIndicator = view.getByText('\u26A0');
    expect(reviewIndicator).toHaveStyle({ color: '#FFFF55' });
  });

  it('calls onSelectRun when a run item is clicked', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );
    const view = within(container);

    fireEvent.click(view.getByText('run-b'));

    expect(onSelectRun).toHaveBeenCalledWith('alpha', 'run-b');
  });

  it('calls onDismissRun when dismiss button is clicked without selecting the run', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );
    const view = within(container);

    fireEvent.click(view.getByLabelText('Dismiss run-c'));

    expect(onDismissRun).toHaveBeenCalledWith('beta/T-3/run-c');
    expect(onSelectRun).not.toHaveBeenCalled();
  });

  it('calls onDismissAll when "Clear all" button is clicked', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );
    const view = within(container);

    fireEvent.click(view.getByText('Clear all'));

    expect(onDismissAll).toHaveBeenCalledOnce();
  });

  it('shows empty state when runs array is empty', () => {
    const { container } = render(
      <RunList
        runs={[]}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );
    const view = within(container);

    expect(view.getByText('No runs')).toBeInTheDocument();
    expect(view.queryByText('Clear all')).not.toBeInTheDocument();
  });

  it('applies selected styling to the matching run', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey="alpha/T-2/run-b"
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );

    const selectedItem = container.querySelector('.run-list-item--selected');
    expect(selectedItem).toBeInstanceOf(HTMLElement);
    if (selectedItem instanceof HTMLElement) {
      expect(within(selectedItem).getByText('run-b')).toBeInTheDocument();
    }
  });

  it('does not apply selected styling when selectedRunKey is null', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );

    const selectedItems = container.querySelectorAll('.run-list-item--selected');
    expect(selectedItems).toHaveLength(0);
  });

  it('shows "Runs" label in header', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );
    const view = within(container);

    expect(view.getByText('Runs')).toBeInTheDocument();
  });

  it('calls onSelectRun when Enter key is pressed on a run item', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );

    const runItem = within(container).getByText('run-a').closest('[role="button"]');
    expect(runItem).toBeInstanceOf(HTMLElement);
    if (runItem instanceof HTMLElement) {
      fireEvent.keyDown(runItem, { key: 'Enter' });
    }

    expect(onSelectRun).toHaveBeenCalledWith('alpha', 'run-a');
  });

  it('calls onSelectRun when Space key is pressed on a run item', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );

    const runItem = within(container).getByText('run-b').closest('[role="button"]');
    expect(runItem).toBeInstanceOf(HTMLElement);
    if (runItem instanceof HTMLElement) {
      fireEvent.keyDown(runItem, { key: ' ' });
    }

    expect(onSelectRun).toHaveBeenCalledWith('alpha', 'run-b');
  });

  it('does not call onSelectRun for other key presses', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );

    const runItem = within(container).getByText('run-a').closest('[role="button"]');
    expect(runItem).toBeInstanceOf(HTMLElement);
    if (runItem instanceof HTMLElement) {
      fireEvent.keyDown(runItem, { key: 'Tab' });
      fireEvent.keyDown(runItem, { key: 'Escape' });
      fireEvent.keyDown(runItem, { key: 'ArrowDown' });
    }

    expect(onSelectRun).not.toHaveBeenCalled();
  });

  it('calls preventDefault on Space key to prevent scrolling', () => {
    const { container } = render(
      <RunList
        runs={createRuns()}
        selectedRunKey={null}
        onSelectRun={onSelectRun}
        onDismissRun={onDismissRun}
        onDismissAll={onDismissAll}
      />,
    );

    const runItem = within(container).getByText('run-a').closest('[role="button"]');
    expect(runItem).toBeInstanceOf(HTMLElement);
    if (runItem instanceof HTMLElement) {
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      runItem.dispatchEvent(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
    }
  });
});
