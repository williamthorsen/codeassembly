<!-- readme-type: library -->

# codeassembly-agent-logic

The agent-logic model: a schema for an agent prompt's states and transitions, the tools that convert a prompt into it, and the React canvas and server glue for apps that present it as a statechart.

```shell
pnpm add codeassembly-agent-logic
```

```tsx
import { examples, layoutConfig, validateConfig } from 'codeassembly-agent-logic';
import { StatechartCanvas } from 'codeassembly-agent-logic/react';
import 'codeassembly-agent-logic/react/styles.css';

const result = validateConfig(examples[0]?.value);
if (result.ok) {
  const elements = await layoutConfig(result.config);
  root.render(<StatechartCanvas elements={elements} selectedPath={undefined} onSelect={console.log} />);
}
```

## Entries

| Entry                                              | Exports                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codeassembly-agent-logic`                         | The config schema and its validation, the converter and coverage check, the chart description, its ELK graph (`buildElkGraph`), its layout, source marking, and the bundled examples. |
| `codeassembly-agent-logic/agent`                   | `convertWithAgent`, which converts a prompt by directing an ACP agent through the conversion.                                                                                         |
| `codeassembly-agent-logic/react`                   | `StatechartCanvas`, the key's entries as data (`CANVAS_KEY_ENTRIES` and the mark glyphs), and the hooks of a page that presents a chart.                                              |
| `codeassembly-agent-logic/react/styles.css`        | The canvas stylesheet.                                                                                                                                                                |
| `codeassembly-agent-logic/server`                  | `createConversionHandler`, which serves conversions on an ACP agent, and its stores.                                                                                                  |
| `codeassembly-agent-logic/client`                  | `createConversionClient`, the browser client of the routes that `createConversionHandler` serves.                                                                                     |
| `codeassembly-agent-logic/agent-logic.schema.json` | The config's JSON Schema.                                                                                                                                                             |

React 19 is a peer of `./react`, and `@williamthorsen/toolbelt.acp` and `@modelcontextprotocol/server` peers of `./agent` and `./server`.

## Converting on an ACP agent

```ts
import { convertWithAgent } from 'codeassembly-agent-logic/agent';
import { claudeCodeProfile } from '@williamthorsen/toolbelt.acp/proposed';

for await (const event of convertWithAgent({ prompt, name: 'refund-request.md', agent: claudeCodeProfile() })) {
  if (event.type === 'result') console.log(event.result);
}
```

`convertWithAgent` runs the agent through [`@williamthorsen/toolbelt.acp`](https://github.com/williamthorsen/toolbelt/tree/main/packages/acp#readme) in an empty temporary directory and gives it two tools: `check_coverage`, which answers 3 checks of its coverage map, and `submit_draft`, which converts a draft and accepts 5. Every other request of the agent is refused. It yields the agent's message text and each check and submission, then a `result` event whose `ConvertResult` is the outcome of the last submission, with the usage and cost that the agent reports. The agent's instructions are [`docs/agent-instructions.md`](docs/agent-instructions.md) followed by the [extraction rules](docs/extraction-rules.md). The doc comment of `convertWithAgent` states when it rejects.

The agent's harness must be installed and signed in. Each profile signs in as follows:

| Profile              | Signs in with                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `claudeCodeProfile`  | The `claude` CLI's login, or `ANTHROPIC_API_KEY` in the environment                                           |
| `antigravityProfile` | The CLI's personal Google login                                                                               |
| `codexProfile`       | Not supported: The profile cannot identify calls of the conversion's tools, so `convertWithAgent` rejects it. |

## Serving conversions

```ts
import { createConversionHandler, createMemoryConversionStore } from 'codeassembly-agent-logic/server';
import { claudeCodeProfile } from '@williamthorsen/toolbelt.acp/proposed';

const handleConversion = createConversionHandler({
  agent: claudeCodeProfile(),
  store: createMemoryConversionStore(),
  authorize: (request) => isSignedIn(request),
  timeoutMs: 10 * 60_000,
  basePath: '/api/conversions',
});
```

```ts
import { createConversionClient } from 'codeassembly-agent-logic/client';

const client = createConversionClient({ url: '/api/conversions' });
const started = await client.start({ prompt, name: 'refund-request.md' });
if (started.ok) {
  for await (const outcome of client.watch(started.conversion.id)) console.log(outcome);
}
```

`createConversionHandler` is a Fetch handler (`Request → Response`) that starts a conversion with `POST {basePath}`, reads it with `GET {basePath}/{id}`, and cancels it with `DELETE {basePath}/{id}`, running each one through `convertWithAgent`. A page that reloads resumes by calling `watch` with the id that it kept. The doc comments of `createConversionHandler` and `ConversionClient` state the status codes and the edge cases. The host supplies:

- Mounting: The host's server passes each request under `basePath` to the handler.
- Authorization: `authorize` decides whether the handler serves a request.
- Store: `createMemoryConversionStore` keeps conversions in one process and drops each ended one after an hour; a durable store implements `ConversionStore`.
- Timeout: `timeoutMs` bounds each conversion, after which it fails.

## What the app supplies

The package draws the chart; the page around it is the app's. The app renders the load controls, the inspector, the source pane, and the terminal in its own design system, and it renders the canvas's key: `StatechartCanvas` passes the marks that the chart draws to its `renderKey` prop, and `CANVAS_KEY_ENTRIES` gives each mark's name, gloss, and drawing. The app also supplies the URL of the conversions resource to `./client`'s `createConversionClient`.

## Styling and theming

Import `codeassembly-agent-logic/react/styles.css` once, through a bundler: It imports React Flow's base styles from this package's own dependency. It declares a default for each custom property on `:root` at zero specificity, so an app overrides any of them on `:root` or on an ancestor of the canvas, for example to map them to its design tokens:

```css
:root {
  --agent-logic-text: var(--ds-text);
  --agent-logic-selected: var(--ds-border-selected);
}
```

The properties, whose defaults [`styles.css`](src/react/styles.css) declares:

- `--agent-logic-ambient-background`, `--agent-logic-compound-background`, `--agent-logic-hover-background`, `--agent-logic-node-background`, `--agent-logic-selected-background`, `--agent-logic-surface`, `--agent-logic-tooltip-background`: backgrounds
- `--agent-logic-text`, `--agent-logic-text-subtle`, `--agent-logic-tooltip-text`: text
- `--agent-logic-border`, `--agent-logic-border-strong`, `--agent-logic-focus-ring`, `--agent-logic-selected`: borders and outlines
- `--agent-logic-global`, `--agent-logic-waiting`, `--agent-logic-warning`: the marks for an any-time transition, a state that waits for the user, and an unreachable state
- `--agent-logic-font-code`: the code font

## The bin

`agent-logic` converts a prompt without installing anything:

```shell
pnpm dlx codeassembly-agent-logic rules
pnpm dlx codeassembly-agent-logic convert prompt.md draft.json prompt.agent-logic.json
pnpm dlx codeassembly-agent-logic check-coverage prompt.md coverage-map.json
pnpm dlx --package codeassembly-agent-logic --package @williamthorsen/toolbelt.acp --package @modelcontextprotocol/server agent-logic convert-with-agent --agent claude-code prompt.md
```

`rules` prints the [extraction rules](docs/extraction-rules.md) by which a model drafts a prompt's logic; `convert` turns the draft into a config; `check-coverage` checks a map of the prompt's instructions against the prompt; `convert-with-agent` converts a prompt on an ACP agent through `convertWithAgent`, which needs the optional peers. `agent-logic <command> --help` describes each command's arguments. [Conversion agreement](docs/conversion-agreement.md) records how consistently a model converts the same prompt, and the [corpus](docs/corpus.md) measures conversions of real prompts.
