import process from 'node:process';
import { createInterface, type Interface } from 'node:readline';

import type { KbRegistryEntry } from '../types.ts';

/** The user's choice from the interactive default-KB picker. */
export type SelectKbChoice = { kind: 'kb'; index: number } | { kind: 'none' } | { kind: 'cancel' };

/**
 * Presents the registered KBs and resolves the user's choice. Injected into `runSetDefault` so the dispatcher itself
 * stays free of terminal I/O and remains directly testable; the real implementation is {@link readlineSelectKbPrompt}.
 */
export type SelectKbPrompt = (input: {
  entries: readonly KbRegistryEntry[];
  currentDefaultName?: string;
}) => Promise<SelectKbChoice>;

/**
 * Renders the numbered selection list: each registered KB (marking the current default) followed by a trailing
 * `(none)` option numbered `entries.length + 1`. When no default is set, `(none)` carries the current marker instead.
 */
export function formatKbSelection(entries: readonly KbRegistryEntry[], currentDefaultName?: string): string {
  const lines = ['Select the default knowledge base:'];
  entries.forEach((entry, index) => {
    const suffix = entry.name === currentDefaultName ? '  (current default)' : '';
    lines.push(`  ${String(index + 1)}) ${entry.name}${suffix}`);
  });
  const noneSuffix = currentDefaultName === undefined ? '  (current)' : '';
  lines.push(`  ${String(entries.length + 1)}) (none) — no default${noneSuffix}`);
  return `${lines.join('\n')}\n`;
}

/**
 * Maps a trimmed answer to a {@link SelectKbChoice}: an empty line cancels, `1..kbCount` selects that KB, and
 * `kbCount + 1` clears the default. Any other value returns `null`, signalling the caller to re-prompt.
 */
export function parseSelection(answer: string, kbCount: number): SelectKbChoice | null {
  if (answer === '') return { kind: 'cancel' };
  const choice = Number(answer);
  if (!Number.isInteger(choice)) return null;
  if (choice >= 1 && choice <= kbCount) return { kind: 'kb', index: choice - 1 };
  if (choice === kbCount + 1) return { kind: 'none' };
  return null;
}

/**
 * A readline-backed {@link SelectKbPrompt}: it prints the selection list, reads a line, and re-prompts until the answer
 * resolves to a choice. This is the feature's sole interactive seam — `cli/index.ts` supplies it only when stdin is a
 * TTY, and other commands (e.g. `kb create`) can reuse it for their own interactive default-KB selection.
 */
export const readlineSelectKbPrompt: SelectKbPrompt = async ({ entries, currentDefaultName }) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(formatKbSelection(entries, currentDefaultName));
    const prompt = `Enter a number [1-${String(entries.length + 1)}], or press Enter to cancel: `;
    let choice = parseSelection((await ask(rl, prompt)).trim(), entries.length);
    while (choice === null) {
      choice = parseSelection((await ask(rl, prompt)).trim(), entries.length);
    }
    return choice;
  } finally {
    rl.close();
  }
};

// region | Helpers

/** Promisified `readline.Interface.question`. */
function ask(rl: Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// endregion | Helpers
