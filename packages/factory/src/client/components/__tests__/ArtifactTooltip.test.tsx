import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ArtifactTooltip.css', () => ({}));

const { ArtifactTooltip } = await import('../ArtifactTooltip.js');

describe('ArtifactTooltip', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders with role="tooltip" for accessibility', () => {
    const { container } = render(
      <ArtifactTooltip type="code" pageX={100} pageY={200} />,
    );

    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).not.toBeNull();
  });

  it('renders all five metadata fields when tooltip data is present', () => {
    const { container } = render(
      <ArtifactTooltip
        type="architecture"
        tooltip={{
          filename: 'arch.md',
          role: 'architect',
          agent: 'orchestrated-architect',
          phase: 'architecture',
          createdAt: '2026-01-15T10:30:00Z',
        }}
        pageX={100}
        pageY={200}
      />,
    );

    const text = container.textContent;
    expect(text).toContain('arch.md');
    expect(text).toContain('architect');
    expect(text).toContain('orchestrated-architect');
    expect(text).toContain('architecture');
    // Timestamp is formatted via toLocaleString, so check for partial match
    expect(text).toContain('2026');
  });

  it('renders just the artifact type when tooltip is undefined', () => {
    const { container } = render(
      <ArtifactTooltip type="code" pageX={100} pageY={200} />,
    );

    const text = container.textContent;
    expect(text).toContain('code');
    // Should not contain metadata labels
    expect(text).not.toContain('file:');
    expect(text).not.toContain('agent:');
  });

  it('does not render the note field (reserved for future use)', () => {
    const { container } = render(
      <ArtifactTooltip
        type="architecture"
        tooltip={{
          filename: 'arch.md',
          role: 'architect',
          agent: 'orchestrated-architect',
          phase: 'architecture',
          createdAt: '2026-01-15T10:30:00Z',
          note: 'Architecture assessment with high impact',
        }}
        pageX={100}
        pageY={200}
      />,
    );

    const text = container.textContent;
    expect(text).not.toContain('Architecture assessment with high impact');
    expect(text).not.toContain('note:');
  });

  it('applies position: fixed with correct offset via inline style', () => {
    const { container } = render(
      <ArtifactTooltip type="code" pageX={100} pageY={200} />,
    );

    const tooltip = container.querySelector('[role="tooltip"]');
    if (tooltip === null) throw new Error('Expected tooltip element to exist');
    if (!(tooltip instanceof HTMLElement)) throw new Error('Expected tooltip to be an HTMLElement');

    expect(tooltip.style.position).toBe('fixed');
    expect(tooltip.style.left).toBe('112px');
    expect(tooltip.style.top).toBe('212px');
  });
});
