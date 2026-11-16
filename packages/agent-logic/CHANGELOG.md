# Changelog

All notable changes to this project will be documented in this file.

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
