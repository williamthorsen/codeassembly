import type { ReactElement } from 'react';

import { LaneView } from './components/lanes/LaneView.tsx';
import { useFleetSnapshot } from './hooks/useFleetSnapshot.ts';
import { useNow } from './hooks/useNow.ts';
import { AppShell, Group, Text, Title } from './integrations/mantine/index.ts';

/** Shell chrome: the Foreman header with the live connection status, and the lane view under it. */
export function App(): ReactElement {
  const { connection, snapshot } = useFleetSnapshot();
  const nowMs = useNow(1_000);
  return (
    <AppShell data-test-id="app" header={{ height: 48 }} padding="md">
      <AppShell.Header>
        <Group h="100%" justify="space-between" px="md">
          <Title order={1} size="h4">
            Foreman
          </Title>
          <Text c={connection === 'live' ? 'dimmed' : 'yellow'} size="sm">
            {connection}
          </Text>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <LaneView nowMs={nowMs} snapshot={snapshot} />
      </AppShell.Main>
    </AppShell>
  );
}
