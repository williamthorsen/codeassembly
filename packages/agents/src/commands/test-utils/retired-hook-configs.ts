/**
 * Harness config texts as an earlier install left them: one sentinel-owned session-lifecycle hook entry beside a
 * foreign entry and an unrelated key, so that a test can assert what removal deletes and what it keeps.
 */

/** A Claude `settings.json` containing a retired hook entry, a foreign hook entry, and an unrelated key. */
export const RETIRED_CLAUDE_SETTINGS = `${JSON.stringify(
  {
    model: 'opus',
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command:
                'node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook SessionStart --sentinel codeassembly-agents',
            },
          ],
        },
        { hooks: [{ type: 'command', command: 'echo foreign' }] },
      ],
    },
  },
  undefined,
  2,
)}\n`;

/** A Rovo `config.yml` containing a retired hook entry, a foreign hook entry, and an unrelated key. */
export const RETIRED_ROVO_CONFIG = [
  'eventHooks:',
  '  logFile: hooks.log',
  '  events:',
  '    - name: on_session_start',
  '      commands:',
  '        - command: node /tmp/relay-hook-event.mjs --harness rovo --hook on_session_start --sentinel codeassembly-agents',
  '    - name: on_session_start',
  '      commands:',
  '        - command: echo foreign',
  '',
].join('\n');
