# Foreman

Foreman is the client app of the fleet-visibility stack: the lane view over Fleet's lanes snapshot and SSE stream. Sessions group into workstream lanes (repo × branch, with ticket attribution), and each session row shows its harness, phase narration, pending ask, and freshness (time since its last event). The header shows the stream's connection state.

Foreman consumes Fleet's route map as an end-to-end typed client via `hc<AppType>`; the SSE stream carries the same `FleetSnapshot` wire type. Nothing here folds events: the server's snapshot is already display-shaped.

## Run

From `packages/foreman/`, with Fleet running (see `packages/fleet/README.md`):

```sh
pnpm run dev    # Vite dev server on http://localhost:4179
```

The dev server proxies `/api` to Fleet on `localhost:4178`; set `FLEET_PORT` to point the proxy at a Fleet on another port. Fleet stays API-only, and client code uses relative URLs only.

`pnpm run build` and `pnpm run preview` serve a production build the same way.

## Vendor boundary

`src/integrations/mantine/` is the sole importer of `@mantine/*`. A direct vendor import anywhere else fails lint, so vendor churn lands in that one directory.
