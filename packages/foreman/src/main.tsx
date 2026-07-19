import { MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';

import '@mantine/core/styles.css';

const root = document.querySelector('#root');
if (root === null) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
);
