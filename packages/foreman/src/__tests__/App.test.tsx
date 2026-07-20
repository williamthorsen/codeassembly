import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.tsx';
import { MantineProvider } from '../integrations/mantine/index.ts';

// The shell only needs a connectable stand-in: jsdom has no EventSource, and no frames arrive in these tests.
class StubEventSource {
  addEventListener(): void {}
  close(): void {}
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', StubEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ lanes: [] })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the header with the connection state and the empty lane view', async () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Foreman' })).toBeInTheDocument();
    expect(screen.getByText('connecting')).toBeInTheDocument();
    expect(await screen.findByText('no events yet')).toBeInTheDocument();
  });
});
