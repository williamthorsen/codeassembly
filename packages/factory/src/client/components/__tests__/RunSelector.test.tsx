import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectIndex } from '../../../shared/types/api.js';

const { mockUseSelectionParams } = vi.hoisted(() => ({
  mockUseSelectionParams: vi.fn(),
}));

vi.mock('../../hooks/useSelectionParams.js', () => ({
  useSelectionParams: mockUseSelectionParams,
}));

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
              { runId: 'run-a', path: '/a', status: 'completed', startedAt: '2026-01-01T00:00:00Z' },
              { runId: 'run-b', path: '/b', status: 'in_progress', startedAt: '2026-01-02T00:00:00Z' },
            ],
          },
          {
            ticketId: 'T-2',
            runs: [{ runId: 'run-c', path: '/c', status: 'failed', startedAt: '2026-01-03T00:00:00Z' }],
          },
        ],
      },
      {
        slug: 'beta',
        tickets: [
          {
            ticketId: 'T-3',
            runs: [{ runId: 'run-d', path: '/d', status: 'completed', startedAt: '2026-01-04T00:00:00Z' }],
          },
        ],
      },
    ],
  };
}

const mockSetParams = vi.fn();

function setDefaultSelectionParams(params: { project?: string; ticket?: string; run?: string } = {}): void {
  mockUseSelectionParams.mockReturnValue({
    initialParams: {
      project: params.project ?? '',
      ticket: params.ticket ?? '',
      run: params.run ?? '',
    },
    setParams: mockSetParams,
  });
}

describe('RunSelector', () => {
  const onSelectRun = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultSelectionParams();
  });

  it('populates project dropdown when index is provided', () => {
    const index = createProjectIndex();

    const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
    const view = within(container);

    expect(view.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'beta' })).toBeInTheDocument();
  });

  it('shows ticket dropdown after selecting project', () => {
    const index = createProjectIndex();

    const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
    const view = within(container);

    // Initially, no ticket dropdown visible
    expect(view.queryByText('Ticket:')).not.toBeInTheDocument();

    // Select a project
    fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });

    // Now ticket dropdown should appear
    expect(view.getByText('Ticket:')).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'T-1 (2 runs)' })).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'T-2 (1 runs)' })).toBeInTheDocument();
  });

  it('shows run dropdown after selecting ticket', () => {
    const index = createProjectIndex();

    const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
    const view = within(container);

    fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });
    fireEvent.change(view.getByLabelText('Ticket:'), { target: { value: 'T-1' } });

    // Run dropdown should appear
    expect(view.getByText('Run:')).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'run-a (completed)' })).toBeInTheDocument();
    expect(view.getByRole('option', { name: 'run-b (in_progress)' })).toBeInTheDocument();
  });

  it('calls onSelectRun when a run is selected', () => {
    const index = createProjectIndex();

    const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
    const view = within(container);

    fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });
    fireEvent.change(view.getByLabelText('Ticket:'), { target: { value: 'T-1' } });
    fireEvent.change(view.getByLabelText('Run:'), { target: { value: 'run-a' } });

    expect(onSelectRun).toHaveBeenCalledWith('alpha', 'run-a');
  });

  it('resets ticket and run when project changes', () => {
    const index = createProjectIndex();

    const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
    const view = within(container);

    // Select project -> ticket -> run
    fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });
    fireEvent.change(view.getByLabelText('Ticket:'), { target: { value: 'T-1' } });

    expect(view.getByText('Run:')).toBeInTheDocument();

    // Switch project -- ticket and run dropdowns should disappear/reset
    fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'beta' } });

    // The ticket dropdown should show beta's tickets, not alpha's
    expect(view.getByRole('option', { name: 'T-3 (1 runs)' })).toBeInTheDocument();
    expect(view.queryByRole('option', { name: 'T-1 (2 runs)' })).not.toBeInTheDocument();

    // Run dropdown should be hidden since ticket was reset
    expect(view.queryByText('Run:')).not.toBeInTheDocument();
  });

  it('resets run when ticket changes', () => {
    const index = createProjectIndex();

    const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
    const view = within(container);

    fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });
    fireEvent.change(view.getByLabelText('Ticket:'), { target: { value: 'T-1' } });
    fireEvent.change(view.getByLabelText('Run:'), { target: { value: 'run-a' } });

    expect(onSelectRun).toHaveBeenCalledTimes(1);

    // Switch ticket -- run dropdown should reset and show T-2's run
    fireEvent.change(view.getByLabelText('Ticket:'), { target: { value: 'T-2' } });

    expect(view.getByRole('option', { name: 'run-c (failed)' })).toBeInTheDocument();
    expect(view.queryByRole('option', { name: 'run-a (completed)' })).not.toBeInTheDocument();
  });

  it('does not render ticket dropdown when no project is selected', () => {
    const index = createProjectIndex();

    const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
    const view = within(container);

    expect(view.queryByText('Ticket:')).not.toBeInTheDocument();
    expect(view.queryByText('Run:')).not.toBeInTheDocument();
  });

  it('renders empty project dropdown when index is null', () => {
    const { container } = render(<RunSelector index={null} onSelectRun={onSelectRun} />);
    const view = within(container);

    // Only the placeholder option should be present
    const options = view.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Select project...');
  });

  describe('URL param restoration', () => {
    it('restores full selection from URL params after fetch and fires onSelectRun', () => {
      setDefaultSelectionParams({ project: 'alpha', ticket: 'T-1', run: 'run-a' });
      const index = createProjectIndex();

      const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
      const view = within(container);

      expect(onSelectRun).toHaveBeenCalledWith('alpha', 'run-a');

      // All three dropdowns should be populated
      expect(view.getByLabelText('Project:')).toHaveValue('alpha');
      expect(view.getByLabelText('Ticket:')).toHaveValue('T-1');
      expect(view.getByLabelText('Run:')).toHaveValue('run-a');
    });

    it('clears invalid URL params via setParams', () => {
      setDefaultSelectionParams({ project: 'nonexistent', ticket: 'T-99', run: 'run-z' });
      const index = createProjectIndex();

      render(<RunSelector index={index} onSelectRun={onSelectRun} />);

      expect(mockSetParams).toHaveBeenCalledWith({
        project: '',
        ticket: '',
        run: '',
      });

      expect(onSelectRun).not.toHaveBeenCalled();
    });

    it('restores partial URL params (project only)', () => {
      setDefaultSelectionParams({ project: 'alpha' });
      const index = createProjectIndex();

      const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
      const view = within(container);

      expect(view.getByLabelText('Project:')).toHaveValue('alpha');

      // Ticket dropdown should be visible
      expect(view.getByText('Ticket:')).toBeInTheDocument();
      // Run dropdown should not be visible
      expect(view.queryByText('Run:')).not.toBeInTheDocument();
      // Should not fire onSelectRun without a run selected
      expect(onSelectRun).not.toHaveBeenCalled();
    });

    it('clears invalid ticket while keeping valid project', () => {
      setDefaultSelectionParams({ project: 'alpha', ticket: 'INVALID', run: 'run-a' });
      const index = createProjectIndex();

      render(<RunSelector index={index} onSelectRun={onSelectRun} />);

      expect(mockSetParams).toHaveBeenCalledWith({
        project: 'alpha',
        ticket: '',
        run: '',
      });

      expect(onSelectRun).not.toHaveBeenCalled();
    });

    it('changing project calls setParams with cascade clear', () => {
      const index = createProjectIndex();

      const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
      const view = within(container);

      fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });

      expect(mockSetParams).toHaveBeenCalledWith({ project: 'alpha', ticket: '', run: '' });
    });

    it('changing ticket calls setParams clearing run', () => {
      const index = createProjectIndex();

      const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
      const view = within(container);

      fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });
      fireEvent.change(view.getByLabelText('Ticket:'), { target: { value: 'T-1' } });

      expect(mockSetParams).toHaveBeenCalledWith({ ticket: 'T-1', run: '' });
    });

    it('selecting run calls setParams', () => {
      const index = createProjectIndex();

      const { container } = render(<RunSelector index={index} onSelectRun={onSelectRun} />);
      const view = within(container);

      fireEvent.change(view.getByLabelText('Project:'), { target: { value: 'alpha' } });
      fireEvent.change(view.getByLabelText('Ticket:'), { target: { value: 'T-1' } });
      fireEvent.change(view.getByLabelText('Run:'), { target: { value: 'run-a' } });

      expect(mockSetParams).toHaveBeenCalledWith({ run: 'run-a' });
    });
  });
});
