# Factory

Factory is a demo visualization that renders orchestration runs as a 2D game scene, built with [Excalibur.js](https://excaliburjs.com/). An Express server reads run data through `codeassembly-run-core`'s parsers, and the client folds it into a logical scene for whichever visualization is selected.

Three visualizations sit behind `src/client/visualizations/registry.ts`: `catwalk` (the default), `factory-floor`, and `office`, selected by the `vis` URL parameter.

The package is dormant.

## Run

From `packages/factory/`:

```sh
pnpm run dev           # Express server and Vite dev server together
pnpm run dev:server
pnpm run dev:client
```

## Reference

From the repository root:

- `.agents/skills/office-game-feel/SKILL.md`, `.agents/skills/office-visual-design/SKILL.md`: animation and visual-design intent for the office visualization, including the adapter pipeline it consumes.
- `docs/pixel-agents-analysis.md`: analysis of [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) on sprite systems and streaming patterns.
