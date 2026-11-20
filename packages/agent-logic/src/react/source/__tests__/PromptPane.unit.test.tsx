/* eslint-disable testing-library/no-container, testing-library/no-node-access -- The pane's contract with an app is
its data attributes and the classes that draw its marks, which have no accessible query. */
// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import { buildPromptSegments } from '../../../source/prompt-segments.ts';
import { buildMinimalConfig, MINIMAL_PROMPT } from '../../../test-utils/minimal-config.ts';
import { PromptPane } from '../PromptPane.tsx';

const DESCRIPTION = describeConfig(buildMinimalConfig());
const SEGMENTS = buildPromptSegments(MINIMAL_PROMPT, DESCRIPTION, [{ start: 60, end: 62 }]);

describe(PromptPane, () => {
  it('shows the whole prompt and names its four marks in a key', () => {
    const { container } = render(<PromptPane segments={SEGMENTS} selected={undefined} onSelect={vi.fn()} />);

    expect(container.querySelector('[data-prompt-text]')).toHaveTextContent(MINIMAL_PROMPT);
    expect(screen.getByRole('list', { name: 'Prompt marks' })).toHaveTextContent('AmbientNot usedNot convertedComment');
  });

  it('labels the pane by its heading', () => {
    render(<PromptPane segments={SEGMENTS} selected={undefined} onSelect={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'Prompt' })).toBeInTheDocument();
  });

  it("marks the selected element's passage and sets the words that it shares in bold", () => {
    const greeting = DESCRIPTION.states.find(({ id }) => id === 'greeting');

    const { container } = render(<PromptPane segments={SEGMENTS} selected={greeting} onSelect={vi.fn()} />);

    const passage = container.querySelector('[data-passage-for="states.greeting"]');
    if (passage === null) throw new Error('The passage is not marked.');
    expect(passage).toHaveAttribute('data-selected');
    expect(passage).toHaveClass('prompt-pane__passage--highlighted');
    expect([...passage.querySelectorAll('b')].map(({ textContent }) => textContent)).toEqual(['Greet', 'user']);
  });

  it('marks the shown unconverted passage', () => {
    const { container } = render(
      <PromptPane
        segments={SEGMENTS}
        selected={undefined}
        shownPassages={[{ start: 60, end: 62 }]}
        onSelect={vi.fn()}
      />,
    );

    const passage = container.querySelector('[data-shown-passage]');
    expect(passage).toHaveAttribute('data-coverage', 'unconverted');
    expect(passage).toHaveAttribute('data-shown');
    expect(passage).toHaveClass('prompt-pane__passage--unconverted', 'prompt-pane__passage--highlighted');
    expect(container.querySelectorAll('[data-shown]')).toHaveLength(1);
  });

  it('marks every shown passage whatever its coverage, and brings the earliest into view', () => {
    const shown = [
      { start: 68, end: 69 },
      { start: 39, end: 50 },
    ];
    const segments = buildPromptSegments(MINIMAL_PROMPT, DESCRIPTION, [], shown);

    const { container } = render(
      <PromptPane segments={segments} selected={undefined} shownPassages={shown} onSelect={vi.fn()} />,
    );

    const marked = [...container.querySelectorAll('[data-shown]')];
    expect(marked.map(({ textContent }) => textContent)).toStrictEqual(['When the us', '.']);
    expect(container.querySelector('[data-shown-passage]')).toHaveTextContent('When the us');
  });

  it('marks unused text and selects nothing when it is clicked', async () => {
    const prompt = `${MINIMAL_PROMPT} Be kind.`;
    const config = buildMinimalConfig();
    config.meta.prompt = prompt;
    const onSelect = vi.fn();
    render(
      <PromptPane
        segments={buildPromptSegments(prompt, describeConfig(config), [])}
        selected={undefined}
        onSelect={onSelect}
      />,
    );

    const unused = screen.getByText('. Be kind.');
    expect(unused).toHaveAttribute('data-coverage', 'unused');
    expect(unused).toHaveClass('prompt-pane__passage--unused');
    expect(unused).not.toHaveAttribute('data-select-path');
    await userEvent.click(unused);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('leaves unmarked the unused space and punctuation between used passages', () => {
    const { container } = render(<PromptPane segments={SEGMENTS} selected={undefined} onSelect={vi.fn()} />);

    const separators = [...container.querySelectorAll('[data-coverage="unused"]')].filter(
      ({ textContent }) => !/[A-Za-z0-9]/.test(textContent),
    );
    expect(separators.length).toBeGreaterThan(0);
    expect(separators.filter((separator) => separator.classList.contains('prompt-pane__passage--unused'))).toEqual([]);
  });

  it('selects the element of a clicked passage, and ignores a click on an unconverted one', async () => {
    const onSelect = vi.fn<(path: string) => void>();
    const { container } = render(<PromptPane segments={SEGMENTS} selected={undefined} onSelect={onSelect} />);

    await userEvent.click(screen.getByText('finish'));
    const unconverted = container.querySelector('[data-coverage="unconverted"]');
    if (unconverted === null) throw new Error('The unconverted passage is not marked.');
    await userEvent.click(unconverted);

    expect(onSelect.mock.calls).toEqual([['states.done']]);
  });

  it('marks a comment as a comment and selects nothing when it is clicked', async () => {
    const prompt = `${MINIMAL_PROMPT} <!-- note -->`;
    const config = buildMinimalConfig();
    config.meta.prompt = prompt;
    const onSelect = vi.fn();
    render(
      <PromptPane
        segments={buildPromptSegments(prompt, describeConfig(config), [])}
        selected={undefined}
        onSelect={onSelect}
      />,
    );

    const comment = screen.getByText('<!-- note -->');
    expect(comment).toHaveAttribute('data-coverage', 'comment');
    await userEvent.click(comment);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks an ambient passage and selects its instruction ahead of an element inside it', async () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 38 }];
    const description = describeConfig(config);
    const onSelect = vi.fn();
    render(
      <PromptPane
        segments={buildPromptSegments(MINIMAL_PROMPT, description, [])}
        selected={undefined}
        onSelect={onSelect}
      />,
    );

    const passage = screen.getByText('Greet the user, then wait for a reply.');
    expect(passage).toHaveAttribute('data-coverage', 'ambient');
    await userEvent.click(passage);

    expect(onSelect).toHaveBeenCalledWith('meta.ambient[0]');
  });
});

describe('PromptPane with Markdown structure', () => {
  const PROMPT = '## Steps\n\n1. Greet the user.\n2. Wait.';
  const config = buildMinimalConfig();
  config.meta.prompt = PROMPT;
  config.states = { greeting: { id: 'greeting', type: 'final', meta: { source: { start: 13, end: 28 } } } };
  const segments = buildPromptSegments(PROMPT, describeConfig(config), []);

  it('sets a heading by its level with its text unchanged and its marker apart', () => {
    const { container } = render(<PromptPane segments={segments} selected={undefined} onSelect={vi.fn()} />);

    const heading = [...container.querySelectorAll('.prompt-pane__passage--h2')];
    expect(heading.map(({ textContent }) => textContent).join('')).toBe('## Steps');
    expect(
      heading
        .filter((passage) => passage.classList.contains('prompt-pane__passage--heading-marker'))
        .map(({ textContent }) => textContent),
    ).toEqual(['##']);
  });

  it("leaves a heading line and a list marker unmarked, and keeps the coverage of each item's prose", () => {
    const { container } = render(<PromptPane segments={segments} selected={undefined} onSelect={vi.fn()} />);

    const structure = [...container.querySelectorAll('[data-coverage="structure"]')];
    expect(structure.map(({ textContent }) => textContent)).toEqual(['##', ' Steps', '1.', '2.']);
    expect(structure.filter(({ className }) => /--(?:structure|unused)\b/.test(className))).toEqual([]);
    expect(screen.getByText('Greet the user.')).toHaveClass('prompt-pane__passage--used');
    expect(screen.getByText('Wait.', { exact: false })).toHaveClass('prompt-pane__passage--unused');
  });
});
