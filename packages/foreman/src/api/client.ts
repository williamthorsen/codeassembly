import type { AppType } from '@codeassembly/fleet';
import { hc } from 'hono/client';

/** Typed Fleet client on a relative base: the dev server's `/api` proxy owns Fleet's address. */
export const fleetClient = hc<AppType>('/');
