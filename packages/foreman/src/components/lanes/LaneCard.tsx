import type { LaneSnapshot } from '@codeassembly/fleet';
import type { ReactElement } from 'react';

import { Badge, Card, Group, Text } from '../../integrations/mantine/index.ts';
import { SessionRow } from './SessionRow.tsx';

interface LaneCardProps {
  lane: LaneSnapshot;
  nowMs: number;
}

/**
 * One workstream lane: repo + branch header with ticket attribution, and its session rows. A closed lane dims,
 * shows why it closed, and collapses its sessions.
 */
export function LaneCard({ lane, nowMs }: LaneCardProps): ReactElement {
  return (
    <Card data-test-id="lane-card" opacity={lane.open ? 1 : 0.5} padding={0} withBorder>
      <Group bg="var(--mantine-color-default-hover)" justify="space-between" px="sm" py="xs">
        <Group gap="xs">
          <Text fw={600}>{lane.repo}</Text>
          <Text c="blue">{lane.branch}</Text>
          {lane.ticketRef === null ? null : (
            <Badge size="sm" variant="light">
              {renderTicketRef(lane.ticketRef)}
            </Badge>
          )}
        </Group>
        {lane.closedReason === null ? null : (
          <Badge color="gray" size="sm" variant="light">
            closed: {lane.closedReason}
          </Badge>
        )}
      </Group>
      {lane.open
        ? lane.sessions.map((session) => <SessionRow key={session.session} nowMs={nowMs} session={session} />)
        : null}
    </Card>
  );
}

// region | Helpers

/** The lane's ticket chip text: `#984`, with the `.N` revisit suffix when the lane is a revisit. */
function renderTicketRef(ticketRef: NonNullable<LaneSnapshot['ticketRef']>): string {
  return `#${ticketRef.ticketId}${ticketRef.revisit === null ? '' : `.${ticketRef.revisit}`}`;
}

// endregion | Helpers
