// The sole importer of the Mantine vendor packages. Pane code takes components and hooks from here, never from
// `@mantine/*` directly, so vendor churn stays in this directory alone; `eslint.config.ts` enforces the boundary.
// Pure re-exports by default: A wrapping module belongs here only when a house default applies.

import '@mantine/core/styles.css';

export { AppShell, Badge, Card, Group, MantineProvider, Stack, Text, Title } from '@mantine/core';
