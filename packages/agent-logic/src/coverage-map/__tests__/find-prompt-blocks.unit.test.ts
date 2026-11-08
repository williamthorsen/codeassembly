import { describe, expect, it } from 'vitest';

import { findPromptBlocks } from '../find-prompt-blocks.ts';

describe(findPromptBlocks, () => {
  it('cuts paragraphs at blank lines and keeps a wrapped line in its paragraph', () => {
    const prompt = 'Greet the user\nwarmly.\n\nThen ask for the order.';

    expect(blockTexts(prompt)).toStrictEqual(['Greet the user\nwarmly.', 'Then ask for the order.']);
  });

  it('makes each list item a block, a nested item included, and keeps its continuation lines', () => {
    const prompt = [
      'Steps:',
      '- Look up the order',
      '  in the store.',
      '  - Check the date.',
      '1. Refund it.',
      '',
      '   Then confirm the refund.',
    ].join('\n');

    expect(blockTexts(prompt)).toStrictEqual([
      'Steps:',
      '- Look up the order\n  in the store.',
      '- Check the date.',
      '1. Refund it.\n\n   Then confirm the refund.',
    ]);
  });

  it('starts a paragraph after a list item when the line after a blank is not indented', () => {
    expect(blockTexts('- Look up the order.\n\nAsk again.')).toStrictEqual(['- Look up the order.', 'Ask again.']);
  });

  it('makes each table body row a block and skips the header and separator rows', () => {
    const prompt = '| Marker | When |\n| --- | --- |\n| ■■■ | strongly |\n| ■■□ | default |';

    expect(blockTexts(prompt)).toStrictEqual(['| ■■■ | strongly |', '| ■■□ | default |']);
  });

  it('makes a fenced block one block, blank lines and headings inside it included', () => {
    const prompt = 'Run the script.\n\n```shell\n# not a heading\n\npnpm run convert\n```\n\nDone.';

    expect(blockTexts(prompt)).toStrictEqual([
      'Run the script.',
      '```shell\n# not a heading\n\npnpm run convert\n```',
      'Done.',
    ]);
  });

  it('finds the same blocks in a prompt with CRLF line endings, front matter and fences included', () => {
    const prompt =
      '---\r\nname: refund\r\n---\r\nRun the script.\r\n\r\n```shell\r\n\r\npnpm run convert\r\n```\r\n\r\nDone.';

    expect(blockTexts(prompt)).toStrictEqual(['Run the script.', '```shell\r\n\r\npnpm run convert\r\n```', 'Done.']);
  });

  it('joins a one-line lead-in that ends with a colon to the fenced block after it', () => {
    const prompt = 'Example:\n\n```\nplan\n```\n\nRun it:\nthen wait.\n\n```\ndone\n```';

    expect(blockTexts(prompt)).toStrictEqual(['Example:\n\n```\nplan\n```', 'Run it:\nthen wait.', '```\ndone\n```']);
  });

  it('makes consecutive blockquote lines one block', () => {
    expect(blockTexts('> Quoted\n> rule.\n\nAfter.')).toStrictEqual(['> Quoted\n> rule.', 'After.']);
  });

  it('skips headings, thematic breaks, lone tags, front matter, and HTML comments', () => {
    const prompt = [
      '---',
      'name: refund',
      '---',
      '# Refunds',
      '<!-- generated -->',
      '<HARD-GATE>',
      'Never refund twice.',
      '</HARD-GATE>',
      '',
      '***',
      '<!--',
      'Not logic.',
      '-->',
    ].join('\n');

    expect(blockTexts(prompt)).toStrictEqual(['Never refund twice.']);
  });

  it('numbers each block by its first line', () => {
    expect(findPromptBlocks('# Title\n\nFirst.\n\n- Second.').map(({ line }) => line)).toStrictEqual([3, 5]);
  });
});

// region | Helpers
/** Returns the text of each block of the prompt. */
function blockTexts(prompt: string): string[] {
  return findPromptBlocks(prompt).map(({ start, end }) => prompt.slice(start, end));
}
// endregion | Helpers
