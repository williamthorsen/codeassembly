# Changelog

All notable changes to this project will be documented in this file.

## 0.10.0 — 2026-11-22

### 🎉 Features

- Adds `Workspace` to `codeassembly-agent-logic/react`, which lays the statechart canvas beside a source pane that stacks the inspector above the `PromptPane`, and which takes the app's `LinkButton` component for the inspector's links. (#2309)
- Adds `Inspector`, a panel that describes the selected state, transition, or ambient instruction and renders each state and transition that it names through the app's `LinkButton` component. (#2309)
- Adds `SourceLine`, which draws a line from the selected chart element to its passage in the prompt pane while both are in view, in the color that the new `--agent-logic-source-line` property sets. (#2309)
- Adds `CanvasKey`, which lists each kind of mark that the chart draws with its gloss, followed by a checkbox that shows and hides the ambient instructions and a toggle that opens the messages panel. (#2310)
- Adds the `Messages` panel, which lists a converted document's gaps, the converter's findings, and its unconverted passages, together with `countMessages` and `hasMessages`, which report how many messages a document has. (#2310)
- Exports `ButtonProps` and `LinkButtonProps`, the props of the app's button and in-page link, with an `isHeading` flag that gives a button titling a section the heading's text size and an `isInline` flag that keeps a link's underline at rest inside a sentence. (#2310)
- Styles the canvas key and the messages panel in `styles.css` from the existing seeds, and adds `--agent-logic-information-background` and `--agent-logic-warning-background` for overriding the backgrounds of the panel's information and warning sections. (#2310)
- Adds to `codeassembly-agent-logic/react` the `useDocumentState` hook, which opens an example or a file stored in a `FileStore` of `@williamthorsen/toolbelt.text-file-store`, keeps the open document in step with the URL and the browser's history, and opens and stores a document of a kind that the app defines through its `otherKind` option and its returned `prepareLoad` and `storeAndOpen`. (#2311)
- Adds `AGENT_LOGIC_SUFFIX` and `isAgentLogicFileName` to the root entry of `codeassembly-agent-logic`, which lets server code, such as a file-store plugin, recognize an agent-logic file name without importing the `./react` entry. (#2311)

## 0.9.0 — 2026-11-22

### 🎉 Features

- Adds `createConversionJobFromInput` to `codeassembly-agent-logic/job`, which recreates the job that `createConversionJob` created from the input that `runJob` posts, for use as the `createJob` option of `createJobHandler` at an operator's endpoint. (#2305)

### 🐛 Bug fixes

- Fixes the issue that `createConversionJob` and `convertWithAgent` accepted a prompt file name containing a newline and sent part of the name to the model as the prompt; both now throw for such a name before the conversion starts. (#2305)

## 0.8.0 — 2026-11-21

### 🎉 Features

- Changes the mouse wheel on the statechart canvas from zooming to panning, with Cmd+wheel on macOS, Ctrl+wheel elsewhere, and a trackpad pinch still zooming. (#2303)
- Names the zoom shortcut in the labels and tooltips of the canvas's Zoom In and Zoom Out buttons: `Cmd+scroll` on macOS and `Ctrl+scroll` elsewhere. (#2303)

## 0.7.0 — 2026-11-21

### 🎉 Features

- Sets each Markdown heading in `PromptPane` by its level, with its `#` marker muted even when the heading is selected, and adds a `heading` field to `PromptSegment` that records the level and whether the segment is the marker. (#2299)

### 🐛 Bug fixes

- Fixes the issue that `PromptPane` marked Markdown heading lines, list markers, and front matter as "Not used", by adding the `structure` value to the exported `Coverage` union, which `buildPromptSegments` assigns to that syntax and the pane leaves unmarked. (#2299)

### 📦 Dependencies

- Upgrades `@testing-library/jest-dom` from 7.0.1 to 8.0.0, whose only breaking change drops support for Vitest versions below 5, which the repository's Vitest 5.1.1 meets. (#2301)

## 0.6.0 — 2026-11-19

### 🎉 Features

- Adds `PromptPane` and `PromptKey` to `codeassembly-agent-logic/react`, which show the whole prompt with a key and mark ambient, unused, unconverted, and comment text, leaving the text that the chart uses unmarked. (#2297)
- Adds the custom properties `--agent-logic-passage-background`, `--agent-logic-text-subtlest`, and `--agent-logic-unconverted` to `codeassembly-agent-logic/react/styles.css` for theming the pane, and adds `--agent-logic-font-prose`, which replaces the serif face that was hard-coded for a flow's preamble. (#2297)

## 0.5.0 — 2026-11-19

### 🎉 Features

- Adds six seed colour properties to `codeassembly-agent-logic/react/styles.css` (`--agent-logic-surface`, `--agent-logic-text`, `--agent-logic-accent`, `--agent-logic-global`, `--agent-logic-waiting`, and `--agent-logic-warning`), from which each component property, such as `--agent-logic-border` or `--agent-logic-selected`, derives its default, and keeps each component property available to override one part. (#2296)
- Changes the default palette and tints the canvas ground with the accent seed, with dots coloured from the text and accent seeds, while React Flow's `--xy-background-color` and `--xy-background-pattern-color` still replace the ground and the dots. (#2296)
- Adds a dotted underline in the global colour to an ambient instruction on the canvas, the same mark that the prompt pane gives ambient text. (#2296)

### 🐛 Bug fixes

- Fixes the issue that a consumer's layered reset, such as Tailwind's preflight, removed the padding that React Flow gives the canvas attribution, by setting that padding in the package's `styles.css` outside any cascade layer. (#2295)

## 0.4.0 — 2026-11-18

### 🎉 Features

- Adds the experimental `codeassembly-agent-logic/job` entry, whose `createConversionJob` returns a job that `runJob` of `@williamthorsen/toolbelt.llm` runs in a page or a hosted function to convert a prompt with the instructions, the `check_coverage` and `submit_draft` tools, and the caps that `convertWithAgent` uses. (#2290)

### 📦 Dependencies

- Upgrades `@xyflow/react` in `codeassembly-agent-logic` from 12.12.1 to 13.0.1 and adapts the statechart canvas to the major version's separate viewport and options stores, its `NodeChangeset` and `EdgeChangeset` change handlers, and its stylesheet path `@xyflow/react/style.css`. (#2289)

## 0.3.0 — 2026-11-16

### 🎉 Features

- Adds the `codeassembly-agent-logic/agent` entry, whose `convertWithAgent` converts a prompt by directing an Agent Client Protocol (ACP) agent that can call only the `check_coverage` and `submit_draft` tools, and yields an event for each coverage check and draft submission, then a `result` event that contains the outcome of the last submission. (#2283)
- Adds the `agent-logic convert-with-agent --agent <profile> <prompt-file> [output-file]` command, which reports each coverage check and draft submission on stderr, writes the config only when it is valid, and exits 130 without writing any output file when Ctrl+C stops the conversion. (#2283)
- Adds `createConversionHandler` to `codeassembly-agent-logic/server`, a Fetch handler that starts, reads, and cancels conversions on an ACP agent under a base path, together with the `ConversionStore` interface and `createMemoryConversionStore`, which keeps conversions in process memory and drops each ended one after a retention period, one hour by default. (#2285)
- Adds the `codeassembly-agent-logic/client` entry, whose browser-safe `createConversionClient` starts, reads, cancels, and watches conversions on the routes that `createConversionHandler` serves, so that a page can resume a conversion by its id after a reload. (#2285)

### 🪦 Removed

- 🚨 **Breaking:** Removes the telefactor-backed conversion path from `codeassembly-agent-logic`: the `./contract` entry, the `createViewerServerPlugins`, `createPromptsApp`, prompt-directory, and viewer-contract exports of `./server`, and the `useAgentBridge`, `useAgentSync`, `useConversion`, `useHarnessList`, and `usePromptDirectory` hooks of `./react`, together with the `@williamthorsen/telefactor` peer dependency. (#2286)

### 🧪 Tests

- Replaces the `vi.waitFor` polls in `conversion-job-implementation.tool.test.ts` and `create-viewer-server-plugins.dev-server.tool.test.ts` with waits that end when the job ends, which only each test's own timeout limits, so that a slow fake-harness start no longer fails either test on a 1 s or 10 s limit. (#2277)

### ⚙️ Tooling

- Upgrade the lint and TypeScript config packages (#2280)

  Upgrades `@williamthorsen/eslint-config-typescript` to 22.0.0, `@williamthorsen/strict-lint` to 15.0.0, and `@williamthorsen/tsconfig` to 0.13.0, and removes the TypeScript import resolver and its `eslint-import-resolver-typescript` dev dependency from the root lint setup.

## 0.2.1 — 2026-11-12

### Notes

- Forced version bump.

## 0.2.0 — 2026-11-09

### 🎉 Features

- Exports `buildElkGraph` and its `ElkGraphOptions` type from the root entry of `codeassembly-agent-logic`, so that a consumer can build the unpositioned graph that `toFlowElements` reads without running the ELK layout engine. (#2265)

### ⚙️ Tooling

- Adds the agent-logic corpus under `packages/agent-logic/corpus/` and the `refresh-corpus` and `score-corpus` scripts, which copy each prompt from the file that Claude Code loads and regenerate `corpus/scorecard.md`, with a test that fails when the committed scorecard differs. (#2264)

## 0.1.0 — 2026-11-09

### 🎉 Features

- Adds the initial `codeassembly-agent-logic` package, whose `contract`, `react`, and `server` subpath entries are placeholders and whose `agent-logic` command prints a usage message that doesn't list any commands yet. (#2257)
- Adds the agent-logic config schema, its validation, the converter, the coverage check, the chart layout, source marking, and the bundled examples to the root entry of `codeassembly-agent-logic`, and exports the config's JSON Schema as `codeassembly-agent-logic/agent-logic.schema.json`. (#2260)
- Adds `StatechartCanvas` and the hooks of a page that presents a chart to `codeassembly-agent-logic/react`, with a `renderKey` slot through which each app draws the canvas's key, and a `react/styles.css` stylesheet that an app themes through `--agent-logic-*` custom properties. (#2260)
- Adds `createViewerServerPlugins` to `codeassembly-agent-logic/server`, which returns the Vite plugins that serve a prompts directory and run conversions through a harness hosted by telefactor, and adds the viewer contract, the conversion job contract, and the built-in harnesses to `codeassembly-agent-logic/contract`. (#2260)
- Adds the `convert`, `check-coverage`, and `rules` commands to the `agent-logic` bin, which turn a model's draft of a prompt's logic into a config, check a coverage map against the prompt, and print the extraction rules that the package ships, so that a skill can run them through `pnpm dlx` without an installed copy. (#2260)

### 🐛 Bug fixes

- Fixes the issue that `agent-logic check-coverage` did not recognize a fenced code block indented under a list item, so that it reported the block's lines as unmapped and ran the block to the end of the prompt. (#2261)
- Fixes the issue that `agent-logic` read an HTML comment as prompt text when the comment followed a lone backtick or a line that opens with an inline triple-backtick span. (#2261)

### ⚙️ Tooling

- Configures ESLint and Vitest in `packages/agent-logic` to lint and test TSX, using the shared config's React and Testing Library rules and the jest-dom matchers. (#2257)

### 📚 Documentation

- Adds the `codeassembly-agent-logic` README, which describes the entries, what an app supplies, theming, and the bin, and adds `docs/conversion-agreement.md`, which records how consistently a model converts the same prompt. (#2260)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
