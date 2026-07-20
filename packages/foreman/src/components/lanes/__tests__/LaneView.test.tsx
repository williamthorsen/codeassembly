import type { FleetSnapshot, LaneSnapshot } from '@codeassembly/fleet';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MantineProvider } from '../../../integrations/mantine/index.ts';
import { LaneView } from '../LaneView.tsx';

const NOW_MS = Date.parse('2026-07-19T12:00:00.000Z');

function buildLane(branch: string): LaneSnapshot {
  return {
    repo: 'owner/repo',
    branch,
    ticketRef: null,
    open: true,
    closedReason: null,
    lastEventTs: '2026-07-19T11:59:48.000Z',
    git: null,
    sessions: [],
    forge: null,
  };
}

function renderView(snapshot: FleetSnapshot | null): void {
  render(
    <MantineProvider>
      <LaneView nowMs={NOW_MS} snapshot={snapshot} />
    </MantineProvider>,
  );
}

describe('LaneView', () => {
  it('shows the empty state before the first frame arrives', () => {
    renderView(null);
    expect(screen.getByText('no events yet')).toBeInTheDocument();
  });

  it('shows the empty state for a fleet with no lanes', () => {
    renderView({ lanes: [] });
    expect(screen.getByText('no events yet')).toBeInTheDocument();
  });

  it('renders one card per lane in server order', () => {
    renderView({ lanes: [buildLane('1037'), buildLane('1036')] });
    const cards = screen.getAllByTestId('lane-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('1037');
    expect(cards[1]).toHaveTextContent('1036');
  });
});
