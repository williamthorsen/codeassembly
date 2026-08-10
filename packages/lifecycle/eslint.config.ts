import baseConfig from '@williamthorsen/eslint-config-typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const config = defineConfig([...baseConfig, globalIgnores(['**/coverage/**', '**/dist/**', '**/local/**'])]);

export default config;
