// Process entry: resolve configuration from the environment and start the server.

import process from 'node:process';

import { resolveConfig } from './config.ts';
import { startFleetServer } from './server.ts';

await startFleetServer({ config: resolveConfig(process.env) });
