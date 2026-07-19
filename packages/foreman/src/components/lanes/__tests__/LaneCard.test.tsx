import type { LaneSnapshot, SessionSnapshot } from '@codeassembly/fleet';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MantineProvider } from '../../../integrations/mantine/index.ts';
import { LaneCard } from '../LaneCard.tsx';

const NOW_MS = Date.parse('2026-07-19T12:00:00.000Z');

function buildLane(overrides: Partial<LaneSnapshot> = {}): LaneSnapshot {
  return {
    repo: 'owner/repo',
    branch: '1037',
    ticketRef: null,
    open: true,
    closedReason: null,
    lastEventTs: '2026-07-19T11:59:48.000Z',
    sessions: [],
    ...overrides,
  };
}

function buildSession(session: string): SessionSnapshot {
  return {
    session,
    harness: 'claude',
    phase: 'working',
    skill: null,
    ask: null,
    stale: false,
    lastEventTs: '2026-07-19T11:59:48.000Z',
  };
}

function renderCard(lane: LaneSnapshot): void {
  render(
    <MantineProvider>
      <LaneCard lane={lane} nowMs={NOW_MS} />
    </MantineProvider>,
  );
}

describe('LaneCard', () => {
  it('shows the repo and branch in the header', () => {
    renderCard(buildLane());
    expect(screen.getByText('owner/repo')).toBeInTheDocument();
    expect(screen.getByText('1037')).toBeInTheDocument();
  });

  it('shows the ticket chip when the branch carries ticket attribution', () => {
    renderCard(buildLane({ ticketRef: { ticketId: '984', revisit: null } }));
    expect(screen.getByText('#984')).toBeInTheDocument();
  });

  it('appends the revisit suffix to the ticket chip', () => {
    renderCard(buildLane({ ticketRef: { ticketId: '984', revisit: 2 } }));
    expect(screen.getByText('#984.2')).toBeInTheDocument();
  });

  it('omits the ticket chip for a non-conforming branch name', () => {
    renderCard(buildLane());
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it('renders one row per session when the lane is open', () => {
    renderCard(buildLane({ sessions: [buildSession('aaaa1111'), buildSession('bbbb2222')] }));
    expect(screen.getAllByTestId('session-row')).toHaveLength(2);
  });

  it('shows the closure reason and collapses sessions when the lane is closed', () => {
    renderCard(buildLane({ open: false, closedReason: 'all-sessions-ended', sessions: [buildSession('aaaa1111')] }));
    expect(screen.getByText('closed: all-sessions-ended')).toBeInTheDocument();
    expect(screen.queryByTestId('session-row')).not.toBeInTheDocument();
  });

  it('dims a closed lane', () => {
    renderCard(buildLane({ open: false, closedReason: 'stale' }));
    expect(screen.getByTestId('lane-card')).toHaveStyle({ opacity: '0.5' });
  });
});
