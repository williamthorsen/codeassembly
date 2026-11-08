import { createContext } from 'react';

import type { DetailLevel } from './zoom-levels.ts';

/** The canvas's current detail level, which changes only when the zoom crosses a threshold. */
export const DetailLevelContext = createContext<DetailLevel>('all-text');
