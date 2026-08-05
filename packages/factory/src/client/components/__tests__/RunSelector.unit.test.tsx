import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectIndex } from '../../../shared/types/api.js';

// Stub CSS import
vi.mock('../RunSelector.css', () => ({}));

const { RunSelector } = await import('../RunSelector.js');

function createProjectIndex(): ProjectIndex {
  return {
    projects: [
      {
        slug: 'alpha',
        tickets: [
          {
            ticketId: 'T-1',
            runs: [
              {
                runId: 'run-a',
                path: '/a',
                status: 'completed',
                startedAt: '2026-01-01T00:00:00Z',
                completedAt: undefined,
              },
              {
                runId: 'run-b',
                path: '/b',
                status: 'in_progress',
                startedAt: '2026-01-02T00:00:00Z',
                completedAt: undefined,
              },
            ],
          },
          {
            ticketId: 'T-2',
            runs: [
              {
                runId: 'run-c',
                path: '/c',
                status: 'failed',
                startedAt: '2026-01-03T00:00:00Z',
                completedAt: undefined,
              },
            ],
          },
        ],
      },
      {
        slug: 'beta',
        tickets: [
          {
            ticketId: 'T-3',
            runs: [
              {
                runId: 'run-d',
                path: '/d',
                status: 'completed',
                startedAt: '2026-01-04T00:00:00Z',
                completedAt: undefined,
              },
            ],
          },
        ],
      },
    ],
  };
}

interface RenderOptions {
  index?: ProjectIndex | null;
  selectedProject?: string;
  selectedTicket?: string;
  selectedRun?: string;
}

function renderSelector(options: RenderOptions = {}) {
  const onSelectProject = vi.fn();
  const onSelectTicket = vi.fn();
  const onSelectRun = vi.fn();

  const result = render(
    <RunSelector
      index={'index' in options ? (options.index ?? null) : createProjectIndex()}
      selectedProject={options.selectedProject ?? ''}
      selectedTicket={options.selectedTicket ?? ''}
      selectedRun={options.selectedRun ?? ''}
      onSelectProject={onSelectProject}
      onSelectTicket={onSelectTicket}
      onSelectRun={onSelectRun}
    />,
  );

  return { ...result, onSelectProject, onSelectTicket, onSelectRun };
}

describe('RunSelector', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates project dropdown when index is provided', () => {
    const { container } = renderSelector();
    const view = within(container);

    expect(view.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'beta' })).toBeInTheDocument();
  });

  it('shows ticket dropdown when project is selected', () => {
    const { container } = renderSelector({ selectedProject: 'alpha' });
    const view = within(container);

    expect(view.getByText('Ticket:')).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'T-1 (2 runs)' })).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'T-2 (1 runs)' })).toBeInTheDocument();
  });

  it('shows run dropdown when project and ticket are selected', () => {
    const { container } = renderSelector({ selectedProject: 'alpha', selectedTicket: 'T-1' });
    const view = within(container);

    expect(view.getByText('Run:')).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'run-a (completed)' })).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'run-b (in_progress)' })).toBeInTheDocument();
  });

  it('reflects selected values in dropdown controls', () => {
    const { container } = renderSelector({
      selectedProject: 'alpha',
      selectedTicket: 'T-1',
      selectedRun: 'run-a',
    });
    const view = within(container);

    expect(view.getByLabelText('Project:')).toHaveValue('alpha');
    expect(view.getByLabelText('Ticket:')).toHaveValue('T-1');
    expect(view.getByLabelText('Run:')).toHaveValue('run-a');
  });

  it('does not render ticket dropdown when no project is selected', () => {
    const { container } = renderSelector();
    const view = within(container);

    expect(view.queryByText('Ticket:')).not.toBeInTheDocument();
    expect(view.queryByText('Run:')).not.toBeInTheDocument();
  });

  it('does not render run dropdown when no ticket is selected', () => {
    const { container } = renderSelector({ selectedProject: 'alpha' });
    const view = within(container);

    expect(view.getByText('Ticket:')).toBeInTheDocument();
    expect(view.queryByText('Run:')).not.toBeInTheDocument();
  });

  it('renders empty project dropdown when index is null', () => {
    const { container } = renderSelector({ index: null });
    const view = within(container);

    const options = view.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Select project...');
  });

  it('shows tickets for the selected project only', () => {
    const { container } = renderSelector({ selectedProject: 'beta' });
    const view = within(container);

    expect(view.getByRole('option', { name: 'T-3 (1 runs)' })).toBeInTheDocument();
    expect(view.queryByRole('option', { name: 'T-1 (2 runs)' })).not.toBeInTheDocument();
  });

  describe('callbacks', () => {
    it('calls onSelectProject when project dropdown changes', () => {
      const { container, onSelectProject } = renderSelector();
      const view = within(container);

      fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });

      expect(onSelectProject).toHaveBeenCalledWith('alpha');
    });

    it('calls onSelectTicket when ticket dropdown changes', () => {
      const { container, onSelectTicket } = renderSelector({ selectedProject: 'alpha' });
      const view = within(container);

      fireEvent.change(view.getByLabelText('Ticket:'), { target: { value: 'T-1' } });

      expect(onSelectTicket).toHaveBeenCalledWith('T-1');
    });

    it('calls onSelectRun with project and run when run dropdown changes', () => {
      const { container, onSelectRun } = renderSelector({
        selectedProject: 'alpha',
        selectedTicket: 'T-1',
      });
      const view = within(container);

      fireEvent.change(view.getByLabelText('Run:'), { target: { value: 'run-a' } });

      expect(onSelectRun).toHaveBeenCalledWith('alpha', 'run-a');
    });

    it('does not call onSelectRun when run dropdown is cleared', () => {
      const { container, onSelectRun } = renderSelector({
        selectedProject: 'alpha',
        selectedTicket: 'T-1',
        selectedRun: 'run-a',
      });
      const view = within(container);

      fireEvent.change(view.getByLabelText('Run:'), { target: { value: '' } });

      expect(onSelectRun).not.toHaveBeenCalled();
    });
  });
});
