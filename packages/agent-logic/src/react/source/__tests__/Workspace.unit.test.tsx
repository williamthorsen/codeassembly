// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import type { StatechartCanvasProps } from '../../canvas/StatechartCanvas.tsx';
import type { ChartLayout } from '../../hooks/useChartLayout.ts';
import type { LinkButtonProps } from '../../slots.ts';
import { Workspace, type WorkspaceProps } from '../Workspace.tsx';

const CONFIG = buildMinimalConfig();
const DESCRIPTION = describeConfig(CONFIG);
const LAID_OUT: ChartLayout = { key: 1, elements: { nodes: [], edges: [] } };

describe(Workspace, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("describes the selected element in the inspector, with its states rendered through the app's link", () => {
    renderWorkspace({ selectedPath: 'states.greeting' });

    expect(screen.getByRole('heading', { name: 'greeting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'done' })).toHaveAttribute('data-test-link');
  });

  it('reports a failed layout in place of the canvas', () => {
    renderWorkspace({ layout: { key: 1, error: 'ELK ran out of memory' } });

    expect(screen.getByText('The layout failed (ELK ran out of memory).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pan' })).not.toBeInTheDocument();
  });

  it('redraws the source line when the canvas pans', async () => {
    renderWorkspace({ selectedPath: 'states.greeting' });
    const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');

    await userEvent.click(screen.getByRole('button', { name: 'Pan' }));

    expect(requestFrame).toHaveBeenCalled();
  });

  it('renders the messages panel with the canvas', () => {
    renderWorkspace({ messages: <p>No messages</p> });

    expect(screen.getByRole('button', { name: 'Pan' })).toBeInTheDocument();
    expect(screen.getByText('No messages')).toBeInTheDocument();
  });
});

// region | Helpers
/** Stands in for the canvas, with a button that reports a pan. */
function FakeCanvas({ onViewportChange }: StatechartCanvasProps): ReactElement {
  return (
    <div className="statechart-canvas">
      <button type="button" onClick={() => onViewportChange?.()}>
        Pan
      </button>
    </div>
  );
}

/** Renders the workspace on the minimal config, with a fake canvas and a marked test link. */
function renderWorkspace(props: Partial<WorkspaceProps>): void {
  render(
    <Workspace
      config={CONFIG}
      description={DESCRIPTION}
      layout={LAID_OUT}
      selectedPath={undefined}
      shownPassages={[]}
      onSelect={vi.fn()}
      renderKey={() => undefined}
      LinkButton={TestLink}
      Canvas={FakeCanvas}
      {...props}
    />,
  );
}

/** Stands in for the app's in-page link, marking each one so that a test can tell it from another button. */
function TestLink({ children, onClick }: LinkButtonProps): ReactElement {
  return (
    <button type="button" data-test-link="" onClick={onClick}>
      {children}
    </button>
  );
}
// endregion | Helpers
