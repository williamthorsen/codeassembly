# Code style

## Function descriptions

Every non-trivial function, component, and class should have a concise description — a single sentence explaining _what_ it does, not _how_. Use a JSDoc `/** ... */` comment directly above the declaration. Trivial one-liners, getters, and test helpers can be left undocumented.

## File structure

Module files follow this order:

1. **Imports** (see [import rules](#import-rules) below)
2. **Types** consumed by the main function or config constants
3. **Config constants** — behavioral controls, column definitions, GraphQL queries, derived config (e.g. `Set` built from a config array)
4. **Main function** (`export function`) — the primary export, whether a component or a utility
5. **Helper functions** — with their own types directly above if scoped to that helper
6. **Style constants** — `xcss()` blocks
7. **Remaining exports** — anything not exported inline

Config constants go below types because they often consume them.

Types used only by a helper function or constant go directly above that function or constant, not in the top-level types section.

Apply this structure consistently regardless of file size.

### What counts as config vs. style

- **Config:** anything that controls _behavior_ — column definitions, field sets, thresholds, feature flags, GraphQL query/fragment constants, enums
- **Style:** anything that controls _appearance_ — `xcss()` blocks, layout constants

### Example

```tsx
import { Box, Flex, Text, xcss } from '@atlaskit/primitives';
import type { ReactNode } from 'react';

type SalaryChartProps = {
  data: readonly SalaryItem[];
};

type SalaryItem = {
  name: string;
  salary: number;
};

const MAX_BARS = 10;
const DEFAULT_CURRENCY = 'USD';

/** Renders a horizontal bar chart of salary values, capped at MAX_BARS entries. */
export function SalaryDistributionChart({ data }: SalaryChartProps): ReactNode {
  const limited = data.slice(0, MAX_BARS);
  return (
    <Box xcss={containerStyles}>
      {limited.map((item, i) => (
        <BarRow key={i} item={item} />
      ))}
    </Box>
  );
}

type BarRowProps = {
  item: SalaryItem;
};

/** Displays a single salary item as a labeled bar. */
function BarRow({ item }: BarRowProps): ReactNode {
  return (
    <Flex xcss={rowStyles}>
      <Text>{fmt(item.salary, DEFAULT_CURRENCY)}</Text>
    </Flex>
  );
}

const containerStyles = xcss({
  padding: 'space.200',
});

const rowStyles = xcss({
  alignItems: 'center',
  gap: 'space.100',
});
```

## Import rules

**Always import `React` explicitly** — never rely on the UMD global (`React.ReactNode` without an import). Use the form that matches your usage:

```tsx
import type React from 'react'; // type-only (React.ReactNode, React.JSX.Element)
import { useRef, useState } from 'react'; // value imports only
import { type default as React, useRef } from 'react'; // both type and value from one statement
```
