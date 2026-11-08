// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { parseConfigText } from '../parse-config-text.ts';

describe(parseConfigText, () => {
  it('parses JSON', () => {
    expect(parseConfigText('{ "id": "agent" }', 'paste')).toEqual({ ok: true, value: { id: 'agent' } });
  });

  it.each([
    ['without a language tag', '```\n{ "id": "agent" }\n```'],
    ['with a language tag', '```json\n{ "id": "agent" }\n```'],
    ['with CRLF line endings and surrounding whitespace', '\r\n```json\r\n{ "id": "agent" }\r\n```\r\n'],
  ])('parses JSON inside an enclosing code fence %s', (_case, text) => {
    expect(parseConfigText(text, 'paste')).toEqual({ ok: true, value: { id: 'agent' } });
  });

  it.each([
    ['with text after the closing fence', '```json\n{ "id": "agent" }\n```\nDone.'],
    ['without a closing fence', '```json\n{ "id": "agent" }'],
    ['of four backticks', '````json\n{ "id": "agent" }\n````'],
  ])('does not remove a fence %s', (_case, text) => {
    expect(parseConfigText(text, 'paste')).toMatchObject({ ok: false, isNotJson: true });
  });

  it('passes a JSON value of any shape to validation', () => {
    expect(parseConfigText('42', 'paste')).toEqual({ ok: true, value: 42 });
  });

  it.each([
    ['file', 'The file is not valid JSON', 'Fix the syntax and open it again.'],
    ['paste', 'The pasted text is not valid JSON', 'Fix the syntax and load it again.'],
  ] as const)('reports text that begins like JSON and does not parse as a syntax error (%s)', (origin, start, end) => {
    const result = parseConfigText('  { "id": ', origin);

    expect(result).toMatchObject({ ok: false, isNotJson: false });
    expect(result.ok ? undefined : result.problems).toEqual([
      { path: '', message: expect.stringMatching(new RegExp(String.raw`^${start} \(.+\)\. ${end}$`)) },
    ]);
  });

  it.each([
    ['prose', 'You are a support agent. Greet the user.'],
    ['empty text', ''],
  ])('reports %s as text that is not JSON', (_case, text) => {
    expect(parseConfigText(text, 'paste')).toEqual({
      ok: false,
      isNotJson: true,
      problems: [
        {
          path: '',
          message:
            'The pasted text is not JSON, so it is not an agent-logic file. To chart a prompt, convert it first.',
        },
      ],
    });
  });

  it('names a file as the file in its problem', () => {
    const result = parseConfigText('Greet the user.', 'file');

    expect(result.ok ? undefined : result.problems[0]?.message).toMatch(/^The file is not JSON/);
  });
});
