import type { CanonicalRunStatus } from 'codeassembly-run-core';

import { moderatelyComplexRun } from './recordings/moderately-complex-run.js';

export interface DemoRecording {
  name: string;
  description: string;
  snapshots: CanonicalRunStatus[];
}

export const DEMO_RECORDINGS: DemoRecording[] = [moderatelyComplexRun];
