import type { AppType } from 'codeassembly-fleet';
import { hc } from 'hono/client';

/** Typed Fleet client on a relative base: The dev server's `/api` proxy owns Fleet's address. */
export const fleetClient = hc<AppType>('/');
