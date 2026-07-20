// The sole importer of the Mantine vendor packages. Pane code takes components and hooks from here, never from
// `@mantine/*` directly, so vendor churn lands in this directory alone; `eslint.config.js` enforces the boundary.
// Pure re-exports by default — a wrapping module earns its place only when a house default applies.

import '@mantine/core/styles.css';

export { AppShell, Badge, Card, Group, MantineProvider, Stack, Text, Title } from '@mantine/core';
