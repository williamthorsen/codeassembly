/* eslint-disable testing-library/no-node-access -- Each sample's class draws its mark, which has no accessible
query. */
// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PromptKey } from '../PromptKey.tsx';

describe(PromptKey, () => {
  it('names each exception to used text with a sample drawn in its mark', () => {
    render(<PromptKey />);

    const samples = within(screen.getByRole('list', { name: 'Prompt marks' }))
      .getAllByRole('listitem')
      .map((entry) => entry.firstElementChild);
    expect(samples.map((sample) => [sample?.textContent, sample?.className])).toStrictEqual([
      ['Ambient', 'prompt-key__sample prompt-key__sample--ambient'],
      ['Not used', 'prompt-key__sample prompt-key__sample--unused'],
      ['Not converted', 'prompt-key__sample prompt-key__sample--unconverted'],
      ['Comment', 'prompt-key__sample prompt-key__sample--comment'],
    ]);
  });
});
