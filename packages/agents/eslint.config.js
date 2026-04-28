import { globalIgnores } from 'eslint/config';

import baseConfig from '../../eslint.config.js';

export default [...baseConfig, globalIgnores(['content/skills/_platforms/**'])];
