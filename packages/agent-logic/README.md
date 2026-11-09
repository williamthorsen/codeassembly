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
| `codeassembly-agent-logic/react`                   | `StatechartCanvas`, the key's entries as data (`CANVAS_KEY_ENTRIES` and the mark glyphs), and the hooks of a page that presents a chart.                                              |
| `codeassembly-agent-logic/react/styles.css`        | The canvas stylesheet.                                                                                                                                                                |
| `codeassembly-agent-logic/server`                  | `createViewerServerPlugins`, the Vite plugins that serve the prompts directory and run conversions through a harness that telefactor hosts.                                           |
| `codeassembly-agent-logic/contract`                | The contracts between a page and its server: the viewer contract, the conversion job, and the built-in harnesses.                                                                     |
| `codeassembly-agent-logic/agent-logic.schema.json` | The config's JSON Schema.                                                                                                                                                             |

React 19 is a peer of `./react`, and `@williamthorsen/telefactor` a peer of `./server` and `./contract`.

## What the app supplies

The package draws the chart; the page around it is the app's. The app renders the load controls, the inspector, the source pane, and the terminal in its own design system, and it renders the canvas's key: `StatechartCanvas` passes the marks that the chart draws to its `renderKey` prop, and `CANVAS_KEY_ENTRIES` gives each mark's name, gloss, and drawing. The app also supplies the conversion server's URL to `createConversionClient`.

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
```

`rules` prints the [extraction rules](docs/extraction-rules.md) by which a model drafts a prompt's logic; `convert` turns the draft into a config; `check-coverage` checks a map of the prompt's instructions against the prompt. `agent-logic <command> --help` describes each command's arguments. [Conversion agreement](docs/conversion-agreement.md) records how consistently a model converts the same prompt, and the [corpus](docs/corpus.md) measures conversions of real prompts.
