import createReactPlugin from '@vitejs/plugin-react';
import { mergeConfig } from 'vite';

import baseConfig from '../../vite.config.ts';

export default mergeConfig(baseConfig, {
  plugins: [createReactPlugin()],
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:5181',
    },
  },
});
