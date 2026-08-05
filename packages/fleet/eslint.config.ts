import { defineConfig } from 'eslint/config';

import baseConfig from '../../eslint.config.ts';

const config = defineConfig([...baseConfig]);

export default config;
