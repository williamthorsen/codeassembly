/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Each sample's class draws its mark,
which has no accessible query. */
// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PromptKey } from '../PromptKey.tsx';

describe(PromptKey, () => {
  it('names each exception to used text with a sample drawn in its mark', () => {
    const { container } = render(<PromptKey />);

    const samples = [...container.querySelectorAll('.prompt-key__sample')];
    expect(samples.map((sample) => [sample.textContent, sample.className])).toStrictEqual([
      ['Ambient', 'prompt-key__sample prompt-key__sample--ambient'],
      ['Not used', 'prompt-key__sample prompt-key__sample--unused'],
      ['Not converted', 'prompt-key__sample prompt-key__sample--unconverted'],
      ['Comment', 'prompt-key__sample prompt-key__sample--comment'],
    ]);
  });

  it('glosses each entry', () => {
    render(<PromptKey />);

    const glosses = ['Ambient', 'Not used', 'Not converted', 'Comment'].map((name) =>
      screen.getByText(name).closest('[aria-describedby]'),
    );
    expect(glosses[0]).toHaveAccessibleDescription('Applies throughout its flow rather than at one state');
    expect(glosses[1]).toHaveAccessibleDescription('Text without any logic to draw');
    expect(glosses[2]).toHaveAccessibleDescription('Logic that a chart cannot express; review each one');
    expect(glosses[3]).toHaveAccessibleDescription('An HTML comment, which the chart does not draw');
  });
});
