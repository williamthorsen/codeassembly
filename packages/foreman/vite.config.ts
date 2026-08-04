import process from 'node:process';

import createReactPlugin from '@vitejs/plugin-react';
import { mergeConfig } from 'vite';

import baseConfig from '../../vite.config.ts';

// The proxy owns Fleet's address so client code uses relative `/api` URLs and never learns the port.
const fleetPort = process.env.FLEET_PORT ?? '4178';

export default mergeConfig(baseConfig, {
  plugins: [createReactPlugin()],
  server: {
    port: 4_179,
    proxy: {
      '/api': `http://localhost:${fleetPort}`,
    },
  },
});
