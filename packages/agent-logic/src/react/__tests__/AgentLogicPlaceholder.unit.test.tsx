// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgentLogicPlaceholder } from '../AgentLogicPlaceholder.tsx';

describe(AgentLogicPlaceholder, () => {
  it('renders its placeholder text', () => {
    render(<AgentLogicPlaceholder />);

    expect(screen.getByText('agent-logic placeholder')).toBeInTheDocument();
  });
});
