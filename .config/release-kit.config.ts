import { defineConfig } from '@williamthorsen/release-kit';

const config = defineConfig({
  releaseNotes: {
    shouldInjectIntoReadme: true,
  },
  repoLabels: {
    extends: ['common'],
    labels: {
      'scope:root': { color: '00ff96', description: 'Monorepo root configuration' },
      'scope:agents': { color: '00ff96', description: 'agents package' },
      'scope:factory': { color: '00ff96', description: 'factory package' },
      'scope:fleet': { color: '00ff96', description: 'fleet package' },
      'scope:foreman': { color: '00ff96', description: 'foreman package' },
      'scope:kb': { color: '00ff96', description: 'kb package' },
      'scope:lifecycle': { color: '00ff96', description: 'lifecycle package' },
      'scope:mcp': { color: '00ff96', description: 'mcp package' },
      'scope:run-core': { color: '00ff96', description: 'run-core package' },
    },
  },
});

export default config;
