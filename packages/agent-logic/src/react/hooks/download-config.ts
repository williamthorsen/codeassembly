import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';

/**
 * Has the browser save the config under the given name as the `convert` script writes it, through a Blob URL and an
 * anchor's click.
 */
export function downloadConfig(fileName: string, config: AgentLogicConfig): void {
  const text = `${JSON.stringify(config, undefined, 2)}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // Release the Blob once the browser has started the download, which it does after the click's task.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
