/* eslint-disable testing-library/no-container, testing-library/no-node-access -- The chart's marks and lines and the
prompt's underlines are drawn by classes, which have no accessible query. */
// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChartTourSample } from '../ChartTourSample.tsx';
import { FindingsTourSample } from '../FindingsTourSample.tsx';
import { PromptTourSample } from '../PromptTourSample.tsx';

describe(ChartTourSample, () => {
  it('states the chart in words for a screen reader', () => {
    render(<ChartTourSample />);

    expect(
      screen.getByRole('img', {
        name: 'A chart: Read the request branches to Approve when the risk is low, and to Ask the owner when it is high',
      }),
    ).toBeInTheDocument();
  });

  it('names the three states and the two conditions', () => {
    const { container } = render(<ChartTourSample />);

    expect([...container.querySelectorAll('text')].map((text) => text.textContent)).toStrictEqual([
      'Read the request',
      'Risk is low',
      'Risk is high',
      'Approve',
      'Ask the owner',
    ]);
  });

  it("draws the start and the end with the canvas key's marks, without their titles", () => {
    const { container } = render(<ChartTourSample />);

    expect(container.querySelectorAll('.mark-initial')).toHaveLength(1);
    expect(container.querySelectorAll('.mark-glyph--final')).toHaveLength(1);
    expect(container.querySelectorAll('title')).toHaveLength(0);
  });

  it('ends each transition in the arrowhead that the sample defines', () => {
    const { container } = render(<ChartTourSample />);

    const markerId = container.querySelector('marker')?.id;
    const ends = [...container.querySelectorAll('.chart-tour-sample__transition')].map((path) =>
      path.getAttribute('marker-end'),
    );
    expect(ends).toStrictEqual([`url(#${markerId})`, `url(#${markerId})`]);
  });
});

describe(FindingsTourSample, () => {
  it('lists the two findings under the heading that names the list', () => {
    render(<FindingsTourSample />);

    const items = within(screen.getByRole('list', { name: 'Messages: 2 findings' })).getAllByRole('listitem');
    expect(items.map((item) => [item.firstElementChild?.textContent, item.textContent])).toStrictEqual([
      ['Unhandled case', 'Unhandled caseThe prompt does not say what to do when the owner never replies.'],
      ['Contradiction', 'ContradictionStep 2 says to approve every low-risk request, and step 5 says to reject some.'],
    ]);
  });
});

describe(PromptTourSample, () => {
  it("underlines each line with the pane's mark for its kind, beside the pane's label", () => {
    render(<PromptTourSample />);

    const entries = within(screen.getByRole('list', { name: 'Three kinds of underlined text' })).getAllByRole(
      'listitem',
    );
    expect(
      entries.map((entry) => [
        entry.firstElementChild?.textContent,
        entry.firstElementChild?.className,
        entry.lastElementChild?.textContent,
      ]),
    ).toStrictEqual([
      ['Keep a friendly tone.', 'prompt-key__sample prompt-key__sample--ambient', 'Ambient'],
      ['You reset passwords for employees.', 'prompt-key__sample prompt-key__sample--unused', 'Not used'],
      ['Usually offer a discount in December.', 'prompt-key__sample prompt-key__sample--unconverted', 'Not converted'],
    ]);
  });
});
