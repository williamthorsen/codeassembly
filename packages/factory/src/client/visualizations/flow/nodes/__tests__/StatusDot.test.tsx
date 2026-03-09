import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../nodes.css', () => ({}));

const { StatusDot } = await import('../StatusDot.js');

describe('StatusDot', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders checkmark SVG for completed status', () => {
    const { container } = render(<StatusDot status="completed" />);
    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('d')).toBe('M1.5 4 L3 5.5 L6.5 2');
  });

  it('renders X SVG for failed status', () => {
    const { container } = render(<StatusDot status="failed" />);
    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('d')).toBe('M2 2 L6 6 M6 2 L2 6');
  });

  it('renders no SVG child for idle status', () => {
    const { container } = render(<StatusDot status="idle" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders no SVG child for working status', () => {
    const { container } = render(<StatusDot status="working" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders no SVG child for skipped status', () => {
    const { container } = render(<StatusDot status="skipped" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('applies correct CSS class for completed status', () => {
    const { container } = render(<StatusDot status="completed" />);
    expect(container.querySelector('.flow-node__status-dot--completed')).not.toBeNull();
  });

  it('applies correct CSS class for failed status', () => {
    const { container } = render(<StatusDot status="failed" />);
    expect(container.querySelector('.flow-node__status-dot--failed')).not.toBeNull();
  });

  it('applies correct CSS class for idle status', () => {
    const { container } = render(<StatusDot status="idle" />);
    expect(container.querySelector('.flow-node__status-dot--idle')).not.toBeNull();
  });

  it('applies correct CSS class for working status', () => {
    const { container } = render(<StatusDot status="working" />);
    expect(container.querySelector('.flow-node__status-dot--working')).not.toBeNull();
  });

  it('applies correct CSS class for skipped status', () => {
    const { container } = render(<StatusDot status="skipped" />);
    expect(container.querySelector('.flow-node__status-dot--skipped')).not.toBeNull();
  });
});
