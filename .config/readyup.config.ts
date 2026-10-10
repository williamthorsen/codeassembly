import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  internal: {
    infix: 'internal',
  },
  sources: [
    'github:williamthorsen/.github',
    'npm:@williamthorsen/eslint-config-typescript',
    'npm:@williamthorsen/nmr',
    'npm:@williamthorsen/release-kit',
    'npm:@williamthorsen/toolbelt.errors',
    'npm:@williamthorsen/toolbelt.vitest',
    'npm:codeassembly',
    'npm:readyup',
    'npm:v11y-check',
  ],
});
