import type { SyncLabelsConfig } from '@williamthorsen/release-kit';

const config: SyncLabelsConfig = {
  presets: ['common'],
  labels: [
    { name: 'scope:root', color: '00ff96', description: 'Monorepo root configuration' },
    { name: 'scope:agents', color: '00ff96', description: 'agents package' },
    { name: 'scope:factory', color: '00ff96', description: 'factory package' },
    { name: 'scope:mcp', color: '00ff96', description: 'mcp package' },
    { name: 'scope:run-core', color: '00ff96', description: 'run-core package' },
  ],
};

export default config;
