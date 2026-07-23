import type { SyncLabelsConfig } from '@williamthorsen/release-kit';

const config: SyncLabelsConfig = {
  presets: ['common'],
  labels: [
    { name: 'scope:root', color: '00ff96', description: 'Monorepo root configuration' },
    { name: 'scope:agents', color: '00ff96', description: 'agents package' },
    { name: 'scope:factory', color: '00ff96', description: 'factory package' },
    { name: 'scope:fleet', color: '00ff96', description: 'fleet package' },
    { name: 'scope:foreman', color: '00ff96', description: 'foreman package' },
    { name: 'scope:kb', color: '00ff96', description: 'kb package' },
    { name: 'scope:lifecycle', color: '00ff96', description: 'lifecycle package' },
    { name: 'scope:mcp', color: '00ff96', description: 'mcp package' },
    { name: 'scope:run-core', color: '00ff96', description: 'run-core package' },
  ],
};

export default config;
