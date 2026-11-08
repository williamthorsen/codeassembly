import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

// Unmount each test's render, which Testing Library does by itself only when Vitest globals are enabled.
afterEach(cleanup);
