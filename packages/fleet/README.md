# Fleet

Fleet is the server of the fleet-visibility stack. It watches the lifecycle-events root, folds each session's append-only event log into per-lane state via `@codeassembly/lifecycle`, and serves the result as a lanes snapshot and an SSE stream of full-fleet frames. Foreman, the stack's client app, consumes Fleet's route types as an end-to-end typed client via `hono/client` — no hand-synced contracts file.

A missing or empty events root serves an empty fleet. The folded state is a rebuildable in-server cache: restarting the server re-folds from disk, and nothing here is a writer concern.

## Run

From `packages/fleet/`:

```sh
pnpm run dev    # restart on source changes
pnpm run start
```

The server runs from TypeScript source; there is no build step.

## Routes

- `GET /api/lanes` — the current full-fleet snapshot.
- `GET /api/stream` — SSE stream pushing a full-fleet snapshot frame whenever fleet state changes.

Workspace packages import the route map and wire types from `@codeassembly/fleet`:

```ts
import { hc } from 'hono/client';

import type { AppType } from '@codeassembly/fleet';

const client = hc<AppType>('http://localhost:4178');
```

## Configuration

| Variable             | Default                  | Purpose                                                                                     |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `FLEET_EVENTS_DIR`   | `~/.codeassembly/events` | Root of the lifecycle-events tree to watch.                                                 |
| `FLEET_PORT`         | `4178`                   | Port to serve on.                                                                           |
| `FLEET_RESCAN_MS`    | `5000`                   | Interval between full rescans — the correctness backstop when watching degrades.            |
| `FLEET_RETENTION_MS` | `259200000`              | How long an idle lane is retained (≈ 3 days) before it is evicted and drops from the fleet. |
| `FLEET_STALE_MS`     | `90000`                  | Quiet threshold after which a working session reads as stale.                               |

Empty or non-numeric values fall back to the defaults.

Filesystem watching is best-effort: where recursive `fs.watch` is unavailable, startup announces rescan-only mode and the rescan interval carries correctness.
