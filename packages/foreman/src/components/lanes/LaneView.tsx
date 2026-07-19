import type { FleetSnapshot } from '@codeassembly/fleet';
import type { ReactElement } from 'react';

import { Stack, Text } from '../../integrations/mantine/index.ts';
import { LaneCard } from './LaneCard.tsx';

interface LaneViewProps {
  nowMs: number;
  snapshot: FleetSnapshot | null;
}

/** The fleet's lanes in server order (most recent first), or an empty state before any lane has events. */
export function LaneView({ nowMs, snapshot }: LaneViewProps): ReactElement {
  if (snapshot === null || snapshot.lanes.length === 0) {
    return (
      <Text c="dimmed" data-test-id="lane-view" fs="italic" py="xl" ta="center">
        no events yet
      </Text>
    );
  }
  return (
    <Stack data-test-id="lane-view" gap="md">
      {snapshot.lanes.map((lane) => (
        <LaneCard key={`${lane.repo}/${lane.branch}`} lane={lane} nowMs={nowMs} />
      ))}
    </Stack>
  );
}
