import type { ReactElement } from 'react';

import { AppShell, Group, Text, Title } from './integrations/mantine/index.ts';

/** Shell chrome: the Foreman header with the connection status, and the main area the lane view fills. */
export function App(): ReactElement {
  return (
    <AppShell header={{ height: 48 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={1} size="h4">
            Foreman
          </Title>
          <Text size="sm" c="dimmed">
            connecting…
          </Text>
        </Group>
      </AppShell.Header>
      <AppShell.Main />
    </AppShell>
  );
}
