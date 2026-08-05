import { render, screen } from '@testing-library/react';
import type { SessionSnapshot } from 'codeassembly-fleet';
import { describe, expect, it } from 'vitest';

import { MantineProvider } from '../../../integrations/mantine/index.ts';
import { SessionRow } from '../SessionRow.tsx';

const NOW_MS = Date.parse('2026-07-19T12:00:00.000Z');

function buildSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session: 'abcd1234-5678-90ef-ghij-klmnopqrstuv',
    harness: 'claude',
    phase: 'working',
    skill: null,
    ask: null,
    stale: false,
    lastEventTs: '2026-07-19T11:59:48.000Z',
    ...overrides,
  };
}

function renderRow(session: SessionSnapshot): void {
  render(
    <MantineProvider>
      <SessionRow nowMs={NOW_MS} session={session} />
    </MantineProvider>,
  );
}

describe('SessionRow', () => {
  it.each([
    ['working with a narrated skill', buildSession({ skill: 'design-and-plan' }), 'running design-and-plan'],
    ['working without narration', buildSession(), 'working'],
    [
      'waiting with an ask prompt',
      buildSession({ phase: 'waiting', ask: { prompt: 'tier selection' } }),
      'waiting: tier selection',
    ],
    ['waiting without an ask prompt', buildSession({ phase: 'waiting' }), 'waiting'],
    ['idle', buildSession({ phase: 'idle' }), 'idle'],
    ['ended', buildSession({ phase: 'ended' }), 'ended'],
  ])('labels a session %s as "%s"', (_case, session, expectedLabel) => {
    renderRow(session);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it('shows the shortened session id with the full id as its tooltip', () => {
    renderRow(buildSession());
    const shortId = screen.getByText('abcd1234');
    expect(shortId).toHaveAttribute('title', 'abcd1234-5678-90ef-ghij-klmnopqrstuv');
  });

  it('shows the harness badge, falling back to unknown when unattributed', () => {
    renderRow(buildSession({ harness: null }));
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('shows the freshness age of the last event', () => {
    renderRow(buildSession());
    expect(screen.getByText('12s ago')).toBeInTheDocument();
  });

  it('dims a stale session', () => {
    renderRow(buildSession({ stale: true }));
    expect(screen.getByTestId('session-row')).toHaveStyle({ opacity: '0.5' });
  });

  it('dims an ended session and strikes through its label', () => {
    renderRow(buildSession({ phase: 'ended' }));
    expect(screen.getByTestId('session-row')).toHaveStyle({ opacity: '0.5' });
    expect(screen.getByText('ended')).toHaveStyle({ textDecoration: 'line-through' });
  });

  it('marks a waiting session with the accent border', () => {
    renderRow(buildSession({ phase: 'waiting' }));
    expect(screen.getByTestId('session-row')).toHaveStyle({ borderLeftStyle: 'solid', borderLeftWidth: '3px' });
  });

  it('does not dim an active session', () => {
    renderRow(buildSession());
    expect(screen.getByTestId('session-row')).toHaveStyle({ opacity: '1' });
  });
});
