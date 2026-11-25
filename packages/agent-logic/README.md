<!-- readme-type: library -->

# codeassembly-agent-logic

The prompt-logic model: a schema for an agent prompt's states and transitions, the tools that convert a prompt into it, and the React canvas and server glue for apps that present it as a statechart.

A prompt-logic file, `<name>.prompt-logic.json`, contains one prompt's logic. The package writes that name and also reads a file written as `<name>.agent-logic.json`.

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

| Entry                                              | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `codeassembly-agent-logic`                         | The config schema, its file-name suffix (`PROMPT_LOGIC_SUFFIX`, `isPromptLogicFileName`, `dropPromptLogicSuffix`), and its validation, the converter and coverage check, the chart description, its ELK graph (`buildElkGraph`), its layout, source marking, and the bundled examples.                                                                                                                                                                                                                                                                                                                                   |
| `codeassembly-agent-logic/agent`                   | `convertWithAgent`, which converts a prompt by directing an ACP agent through the conversion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `codeassembly-agent-logic/react`                   | `StatechartCanvas` and its `CanvasKey`, the key's entries as data (`CANVAS_KEY_ENTRIES` and the mark glyphs), `PromptPane` and its `PromptKey`, `Inspector`, `SourceLine`, the `Workspace` that composes them, the `Messages` panel, the props of the app's button and link, the hooks of a page that presents a chart, `useDocumentState`, which opens an example or a stored file, `useStoredFiles`, which keeps the list of the stored files current, and the Visualizations table's rows (`buildVisualizationRows`, `sortVisualizationRows`), with `matchesName` and `nameStoredFile` for a list's search and names. |
| `codeassembly-agent-logic/react/styles.css`        | The stylesheet of the canvas and its key, the prompt pane, the inspector, the source line, the workspace, and the messages panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `codeassembly-agent-logic/server`                  | `createConversionHandler`, which serves conversions on an ACP agent, and its stores.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `codeassembly-agent-logic/client`                  | `createConversionClient`, the browser client of the routes that `createConversionHandler` serves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `codeassembly-agent-logic/job`                     | `createConversionJob`, which converts a prompt as a job of `@williamthorsen/toolbelt.llm`, in a page or a function, and `createConversionJobFromInput`, which creates the job at an endpoint.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `codeassembly-agent-logic/agent-logic.schema.json` | The config's JSON Schema.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

React 19 is a peer of `./react`, `@williamthorsen/toolbelt.acp` and `@modelcontextprotocol/server` peers of `./agent` and `./server`, and `@williamthorsen/toolbelt.llm` a peer of `./job`.

## Converting on an ACP agent

```ts
import { convertWithAgent } from 'codeassembly-agent-logic/agent';
import { claudeCodeProfile } from '@williamthorsen/toolbelt.acp/proposed';

for await (const event of convertWithAgent({ prompt, name: 'refund-request.md', agent: claudeCodeProfile() })) {
  if (event.type === 'result') console.log(event.result);
}
```

`convertWithAgent` runs the agent through [`@williamthorsen/toolbelt.acp`](https://github.com/williamthorsen/toolbelt/tree/main/packages/acp#readme) in an empty temporary directory and gives it two tools: `check_coverage`, which answers 3 checks of its coverage map, and `submit_draft`, which converts a draft and accepts 5. Every other request of the agent is refused. It yields the agent's message text and each check and submission, then a `result` event whose `ConvertResult` is the outcome of the last submission, with the usage and cost that the agent reports. The agent's instructions are [`docs/agent-instructions.md`](docs/agent-instructions.md) followed by the [extraction rules](docs/extraction-rules.md), the same text that a [conversion job](#converting-in-a-page-or-a-function) sends. The doc comment of `convertWithAgent` states when it rejects.

The agent's harness must be installed and signed in. Each profile signs in as follows:

| Profile              | Signs in with                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `claudeCodeProfile`  | The `claude` CLI's login, or `ANTHROPIC_API_KEY` in the environment                                           |
| `antigravityProfile` | The CLI's personal Google login                                                                               |
| `codexProfile`       | Not supported: The profile cannot identify calls of the conversion's tools, so `convertWithAgent` rejects it. |

## Converting in a page or a function

```ts
import { createConversionJob } from 'codeassembly-agent-logic/job';
import { runJob } from '@williamthorsen/toolbelt.llm/proposed';

const outcome = await runJob(createConversionJob({ prompt, name: 'refund-request.md' }), {
  provider: 'anthropic',
  apiKey,
  model: 'claude-sonnet-5-5',
});
if (outcome.status === 'completed') console.log(outcome.result);
```

`createConversionJob` returns a job for [`@williamthorsen/toolbelt.llm`](https://github.com/williamthorsen/toolbelt/tree/main/packages/llm#readme), which runs it in the page on a user's connection or at an operator's endpoint, without a harness. The job sends the instructions and the message that `convertWithAgent` sends, offers the same two tools with the same caps, and makes at most `MAX_ROUNDS` model requests. Its result is a `ConvertResult`, available once the conversion is finished: the config accepted, the prompt recorded out of scope, or the last of the 5 submissions rejected. A run that the model ends earlier is `unfinished`. Create a job for each run.

When the page runs the job at an operator's endpoint, `runJob` posts only the job's input, and the endpoint's `createJobHandler` creates the job from it. `createConversionJobFromInput` creates the job that `createConversionJob` created for that input, and throws for input that `createConversionJob` does not create:

```ts
import { createConversionJobFromInput } from 'codeassembly-agent-logic/job';
import { createJobHandler } from '@williamthorsen/toolbelt.llm/proposed';

export const POST = createJobHandler({
  createJob: createConversionJobFromInput,
  connection: { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: operatorKey },
  maxInputLength: 100_000,
});
```

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

`createConversionHandler` is a Fetch handler (`Request → Response`) that starts a conversion with `POST {basePath}`, reads it with `GET {basePath}/{id}`, and cancels it with `DELETE {basePath}/{id}`, running each one through `convertWithAgent`. A page that reloads resumes by calling `watch` with the id that it kept. An ended conversion reports its `startedAt` and `endedAt`, so a client measures its duration even when it ended unwatched. The doc comments of `createConversionHandler` and `ConversionClient` state the status codes and the edge cases. The host supplies:

- Mounting: The host's server passes each request under `basePath` to the handler.
- Authorization: `authorize` decides whether the handler serves a request.
- Store: `createMemoryConversionStore` keeps conversions in one process and drops each ended one after an hour; a durable store implements `ConversionStore`.
- Timeout: `timeoutMs` bounds each conversion, after which it fails.

## What the app supplies

The package draws the chart and its key, the prompt, the inspector of the selected element, and the messages panel; the page around them is the app's. The app renders the load controls and the terminal in its own design system. `StatechartCanvas` passes the marks that the chart draws to its `renderKey` prop, into which the app renders `CanvasKey`; `CANVAS_KEY_ENTRIES` gives each mark's name, gloss, and drawing to an app that draws a key of its own.

`Workspace` lays the canvas beside the source pane, in which `Inspector` describes the selected element above the `PromptPane`, and `SourceLine` joins the selected element to its passage. It fills the height that its flex parent leaves, and the app sets its outer spacing. The app supplies its links as the required `LinkButton` component, whose props are `LinkButtonProps`: It renders a button styled as an in-page link with its own pointer, hover, and focus states, so that the links match the app's design system, and keeps the underline at rest when `isInline` is set, for a link inside a sentence. `Workspace` also takes an optional `Canvas` component in place of `StatechartCanvas`, through which an app's tests replace React Flow. Each component's doc comment states its props.

`CanvasKey` lists the marks that the chart draws, each with its gloss, followed by the optional toggles of the ambient instructions and of the messages panel. `Messages` lists the document's gaps, the converter's findings, and its unconverted passages, and stays hidden until its toggle opens it; the app renders it into `Workspace`'s `messages` prop. `countMessages` returns the counts that the toggle states, and `hasMessages` whether the panel has anything to list. Both components take the app's button as the required `Button` component, whose props are `ButtonProps`: It renders a button that looks like a button at rest, with its own pointer, hover, and focus states, and forwards the ARIA attributes that it receives. A button in a line of text or in the key takes the app's compact size, and one with `isHeading` set, the disclosure that titles a section, takes the heading's text size. `Messages` also takes `LinkButton`.

`PromptPane` shows the whole prompt, marking the text that the chart does not use and leaving used text unmarked, with its key, which glosses each mark. It sets each Markdown heading by its level, with its `#` muted, and leaves Markdown structure, such as heading lines and list markers, unmarked. The app supplies its segments, from `buildPromptSegments`, the selected element, the passages to show, and the handler that receives a clicked passage's path. `SourceLine` finds the pane's text by `data-prompt-text` and the passage by `data-passage-for`, whose value is the element's path; `PromptPane`'s doc comment lists its other attributes. `PromptKey` renders the key alone, for an app that places it outside the pane. The app also supplies the URL of the conversions resource to `./client`'s `createConversionClient`.

`useDocumentState` owns what the document region shows, the start page, the Visualizations table, or one document, and keeps it in step with the URL and the browser's history. The app supplies the `FileStore` of `@williamthorsen/toolbelt.text-file-store` (its `./proposed` entry) from which a stored file is read and into which the Upload card's text is written, and the `announce` function of its status region; it renders the region and sets the tab title from the state that the hook returns. An app that stores a document of its own kind, such as an unconverted prompt, reads it through the `otherKind` option and writes it through the returned `prepareLoad` and `storeAndOpen`. The hook's doc comment states its options and fields. The app passes the same `FileStore` to `useStoredFiles`, which lists its files, and those files and the examples to `buildVisualizationRows`, which returns the Visualizations table's rows; an app that stores a file of its own kind names it through the `readKind` option, and labels the kinds for `sortVisualizationRows` through `labelKind`. Their doc comments state the order and the sort.

## Tour slides

The `./react` entry also exports the slides that teach a reader how to read a chart, as `ChartTourStep`s, which fit `@williamthorsen/tour-react`'s `Tour` without this package depending on it: `CHART_TOUR_STEP`, `PROMPT_TOUR_STEP`, `FINDINGS_TOUR_STEP`, and `buildSelectionTourStep`, which takes the app's visual of its own page. Each step's visual is one of the exported samples, `ChartTourSample`, `PromptTourSample`, and `FindingsTourSample`, drawn in the marks that the canvas and the pane draw. The app adds its own opening and closing slides around them:

```tsx
const steps = [
  overviewStep,
  CHART_TOUR_STEP,
  buildSelectionTourStep(<PageSchematic />),
  PROMPT_TOUR_STEP,
  FINDINGS_TOUR_STEP,
  startStep,
];
```

## Styling and theming

Import `codeassembly-agent-logic/react/styles.css` once, through a bundler: It imports React Flow's base styles from this package's own dependency. Its defaults form a finished light theme, which applies under any `color-scheme`.

The colours come in two tiers of custom properties. The seeds are a few base colours, and every other colour derives from them, so an app sets the seeds alone to retheme the canvas, its key, the pane, the workspace, the messages panel, and the tour samples, for example to map them to its design tokens or to make a dark theme:

```css
:root {
  --agent-logic-surface: var(--ds-surface);
  --agent-logic-text: var(--ds-text);
  --agent-logic-accent: var(--ds-border-selected);
}
```

Set the properties on `:root`, or on an ancestor of the components and of any key that the app renders outside them. The seeds, whose defaults [`styles.css`](src/react/styles.css) declares:

- `--agent-logic-surface`: the background of a state and of a label
- `--agent-logic-text`: the text
- `--agent-logic-accent`: selection and focus
- `--agent-logic-global`, `--agent-logic-waiting`, `--agent-logic-warning`: the marks for an any-time transition and ambient text, a state that waits for the user, and an unreachable state

The component properties, which an app sets to override one part; `styles.css` states each derivation:

- `--agent-logic-ambient-background`, `--agent-logic-compound-background`, `--agent-logic-hover-background`: backgrounds, from `text` (and `surface` for a compound state)
- `--agent-logic-danger-text`: the message of a failed layout, from `warning` and `text`
- `--agent-logic-information-background`, `--agent-logic-warning-background`: the information and warning sections of the messages panel, from `accent` and `warning` with `surface`
- `--agent-logic-information-icon`, `--agent-logic-warning-icon`: the icons of those sections, from `accent` and `warning`
- `--agent-logic-node-background`, `--agent-logic-tooltip-text`: from `surface`
- `--agent-logic-selected-background`, `--agent-logic-passage-background`: from `accent` and `surface`; the second fills the pane's selected and shown passages
- `--agent-logic-text-subtle`, `--agent-logic-text-subtlest`, `--agent-logic-border`, `--agent-logic-border-strong`: from `text` and `surface`; the pane sets unused text in the first and comments in the second
- `--agent-logic-unconverted`: the wavy line under unconverted text, from `warning` and `text`
- `--agent-logic-tooltip-background`: from `text`
- `--agent-logic-focus-ring`, `--agent-logic-selected`: from `accent`
- `--agent-logic-source-line`: the source line, from `selected`
- `--agent-logic-workspace-border`: the workspace's frame and the dividers between its regions, from `border`, which outlines a state

The canvas's ground and its dots also derive from the seeds; React Flow's `--xy-background-color` and `--xy-background-pattern-color` replace them. `--agent-logic-font-code` sets the code font, and `--agent-logic-font-prose` the face in which the pane, a flow's preamble, and the messages panel quote the prompt.

## The bin

`agent-logic` converts a prompt without installing anything:

```shell
pnpm dlx codeassembly-agent-logic rules
pnpm dlx codeassembly-agent-logic convert prompt.md draft.json prompt.prompt-logic.json
pnpm dlx codeassembly-agent-logic check-coverage prompt.md coverage-map.json
pnpm dlx --package codeassembly-agent-logic --package @williamthorsen/toolbelt.acp --package @modelcontextprotocol/server agent-logic convert-with-agent --agent claude-code prompt.md
```

`rules` prints the [extraction rules](docs/extraction-rules.md) by which a model drafts a prompt's logic; `convert` turns the draft into a config; `check-coverage` checks a map of the prompt's instructions against the prompt; `convert-with-agent` converts a prompt on an ACP agent through `convertWithAgent`, which needs the optional peers. `agent-logic <command> --help` describes each command's arguments. [Conversion agreement](docs/conversion-agreement.md) records how consistently a model converts the same prompt, and the [corpus](docs/corpus.md) measures conversions of real prompts.
