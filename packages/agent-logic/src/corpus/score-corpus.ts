import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { type OutOfScope, outOfScopeSchema } from '../convert/draft-schema.ts';
import type { AgentLogicConfig } from '../schema/agent-logic-schema.ts';
import { validateConfig } from '../schema/validate-config.ts';
import { type Gap, type Review, reviewSchema, type Run, runSchema } from './corpus-schemas.ts';
import { type ChartScore, scoreChart } from './score-chart.ts';

/** The package's corpus directory. */
export const CORPUS_DIRECTORY = path.resolve(import.meta.dirname, '../../corpus');

/**
 * The subdirectory of a corpus directory that holds `run.json`, the reviews, and the out-of-scope verdicts, so that the
 * corpus directory itself contains only prompts, charts, and the scorecard.
 */
export const RECORDS_DIRECTORY = 'records';

/** The scorecard's file name in a corpus directory. */
export const SCORECARD_FILE = 'scorecard.md';

const GUIDANCE_SKILL = 'node_modules/codeassembly-guidance/content/skills/convert-agent-prompt/SKILL.md';

/**
 * The sources that a converter follows, whose current versions the scorecard compares each result against. The skill is
 * the root-pinned `codeassembly-guidance` package's copy, because CI installs that package and does not deploy guidance.
 */
export const SOURCE_FILES: SourceFiles = {
  skill: path.resolve(import.meta.dirname, '../../../..', GUIDANCE_SKILL),
  rules: path.resolve(import.meta.dirname, '../../docs/extraction-rules.md'),
};

export interface SourceFiles {
  skill: string;
  rules: string;
}

/** The `git hash-object` ids of the sources. */
export interface SourceBlobs {
  skillBlob: string;
  rulesBlob: string;
}

/** A corpus prompt with what its conversion produced and its review. */
export interface CorpusEntry {
  name: string;
  prompt: string;
  output: { config: AgentLogicConfig } | { outOfScope: OutOfScope };
  review: Review;
}

export interface Corpus {
  run: Run;
  /** The sources as they are now. */
  current: SourceBlobs;
  entries: CorpusEntry[];
}

const CRITERION_LABELS: Record<Gap['criterion'], string> = {
  coverage: 'Coverage',
  fidelity: 'Fidelity',
  placement: 'Quote placement',
  gates: 'Gates',
  unconverted: 'Unconverted accuracy',
  gapsReport: 'Gaps report',
  scope: 'Scope',
};

/**
 * Reads every `<name>.md` prompt in the directory with its `<name>.agent-logic.json` or out-of-scope
 * `<name>.problems.json`, and its `<name>.review.json` and `run.json` from the records directory. Throws on any file
 * that is missing or invalid, on a review whose failing verdict names no gap or whose gap names a passing criterion,
 * and on a result produced under older sources that no recheck carries to the current ones.
 */
export function readCorpus(directory: string, sources: SourceFiles = SOURCE_FILES): Corpus {
  const run = runSchema.parse(readJson(path.join(directory, RECORDS_DIRECTORY, 'run.json')));
  const current = { skillBlob: hashBlob(sources.skill), rulesBlob: hashBlob(sources.rules) };
  const names = readdirSync(directory)
    .filter((file) => file.endsWith('.md') && file !== SCORECARD_FILE)
    .map((file) => file.slice(0, -'.md'.length))
    .toSorted();
  for (const name of names) {
    const prompt = run.prompts[name];
    if (prompt === undefined) throw new Error(`${name}: run.json lists no origin for the prompt`);
    if (run.sources[prompt.source] === undefined)
      throw new Error(`${name}: run.json lists no source "${prompt.source}"`);
  }
  for (const name of Object.keys(run.prompts)) {
    if (!names.includes(name)) throw new Error(`${name}: run.json lists a prompt that the corpus does not contain`);
  }
  const entries = names.map((name) => readEntry(directory, name, current));
  return { run, current, entries };
}

/**
 * Renders one prompt's measures and the gaps that the viewer reports, without reading its review, so that a reviewer
 * sees them before the review exists.
 */
export function renderPromptScore(directory: string, name: string): string {
  const prompt = readFileSync(path.join(directory, `${name}.md`), 'utf8');
  const output = readOutput(directory, name);
  if ('outOfScope' in output) return `${name}: out of scope: ${output.outOfScope.reason}\n`;
  const score = scoreChart(prompt, output.config);
  const lines = [
    `${name}:`,
    `- States: ${score.states}`,
    `- Transitions: ${score.transitions}`,
    `- Inferred: ${score.inferred}`,
    `- Ambient: ${score.ambient}`,
    `- Unconverted: ${score.unconverted}`,
    `- Text in spans: ${formatPercent(score.coverage)}`,
    `- Gaps that the viewer reports:${score.reportedGaps.length === 0 ? ' none' : ''}`,
    ...score.reportedGaps.map((gap) => `  - ${gap}`),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Renders the scorecard's Markdown: the run, a row per prompt, the out-of-scope prompts, and every gap. */
export function renderScorecard({ run, current, entries }: Corpus): string {
  const charts: { entry: CorpusEntry; config: AgentLogicConfig }[] = [];
  const outOfScope: { entry: CorpusEntry; reason: string }[] = [];
  for (const entry of entries) {
    if ('config' in entry.output) charts.push({ entry, config: entry.output.config });
    else outOfScope.push({ entry, reason: entry.output.outOfScope.reason });
  }
  const lines = [
    '# Corpus scorecard',
    '',
    `Generated by \`pnpm run score-corpus\` from the files in \`corpus/\`. Do not edit it by hand.`,
    '',
    `Run on ${run.date} with ${run.model}. Each prompt is the file that Claude Code loads for the skill.`,
    '',
    ...describeOrigins(run).flatMap((line) => [line, '']),
    `Current sources: \`SKILL.md\` blob \`${shortenId(current.skillBlob)}\`, \`docs/extraction-rules.md\` blob \`${shortenId(current.rulesBlob)}\`. The Rules column names the rules that each result was converted under; a result converted under older rules was rechecked against the current ones, as its gaps section states.`,
    '',
    '## Converted',
    '',
    "Text in spans is the share of the prompt's non-whitespace text inside the quote of an element, an ambient instruction, or an unconverted passage. A quote is a short clause, so the share stays low when every step has an element; the Coverage verdict judges that.",
    '',
    '| Prompt | Rules | Convert runs | States | Transitions | Inferred | Ambient | Unconverted | Reported gaps | Text in spans | Coverage verdict | Fidelity | Quote placement | Gates | Unconverted accuracy | Gaps report |',
    '| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- | --- | --- | --- |',
    ...charts.map(({ entry, config }) => renderChartRow(entry, scoreChart(entry.prompt, config))),
  ];
  if (outOfScope.length > 0) {
    lines.push(
      '',
      '## Out of scope',
      '',
      '| Prompt | Rules | Convert runs | Scope verdict | Reason |',
      '| --- | --- | --: | --- | --- |',
      ...outOfScope.map(({ entry, reason }) => {
        const scope = 'scope' in entry.review.verdicts ? entry.review.verdicts.scope : '';
        return `| ${entry.name} | \`${shortenId(entry.review.rulesBlob)}\` | ${entry.review.convertRuns} | ${scope} | ${escapeCell(reason)} |`;
      }),
    );
  }
  lines.push('', '## Gaps', '');
  for (const entry of entries) {
    const reported = 'config' in entry.output ? scoreChart(entry.prompt, entry.output.config).reportedGaps : [];
    lines.push(`### ${entry.name}`, '');
    const { recheck } = entry.review;
    if (recheck !== undefined) {
      lines.push(
        `Converted under rules \`${shortenId(entry.review.rulesBlob)}\` and rechecked against \`${shortenId(recheck.rulesBlob)}\`: ${recheck.note}`,
        '',
      );
    }
    if (entry.review.gaps.length === 0) lines.push('No gaps found.');
    for (const gap of entry.review.gaps) lines.push(`- **${CRITERION_LABELS[gap.criterion]}:** ${gap.text}`);
    if (reported.length > 0) {
      lines.push('', 'Gaps that the viewer reports:', '', ...reported.map((gap) => `- ${gap}`));
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

// region | Helpers
function describeOrigins(run: Run): string[] {
  return Object.entries(run.sources).map(([key, source]) => {
    const prompts = Object.entries(run.prompts)
      .filter(([, prompt]) => prompt.source === key)
      .map(([name]) => name)
      .toSorted()
      .join(', ');
    if (source.kind === 'plugin') {
      return `The ${source.plugin} plugin ${source.version}, from ${source.repository} at \`${shortenId(source.commit)}\` (${source.license}): ${prompts}.`;
    }
    const { build } = source;
    const declared = source.declared
      .map(
        ({ name, commit, pinnedByBuild }) =>
          `\`${name}\` at \`${shortenId(pinnedByBuild ? build.sourceCommit : commit)}\``,
      )
      .join(', ');
    return `codeassembly ${build.version} deployed these with \`${build.command}\` at ${build.writtenAt}, from ${source.repository} (${source.license}), with ${declared}: ${prompts}.`;
  });
}

/** Escapes the characters that end a Markdown table cell or its row. */
function escapeCell(text: string): string {
  return text.replaceAll('|', String.raw`\|`).replaceAll('\n', ' ');
}

/** Formats a share from 0 to 1 as a whole percent. */
function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Returns the id that `git hash-object` gives the file. */
function hashBlob(file: string): string {
  const content = readFileSync(file);
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

function readEntry(directory: string, name: string, current: SourceBlobs): CorpusEntry {
  const prompt = readFileSync(path.join(directory, `${name}.md`), 'utf8');
  const output = readOutput(directory, name);
  const review = reviewSchema.parse(readJson(path.join(directory, RECORDS_DIRECTORY, `${name}.review.json`)));
  const isScopeReview = 'scope' in review.verdicts;
  if (isScopeReview !== 'outOfScope' in output) {
    throw new Error(`${name}: the review's verdicts do not match the output, a chart or an out-of-scope verdict`);
  }
  const verdicts: Partial<Record<Gap['criterion'], 'fail' | 'pass'>> = review.verdicts;
  for (const [criterion, verdict] of Object.entries(verdicts)) {
    if (verdict === 'fail' && review.gaps.every((gap) => gap.criterion !== criterion)) {
      throw new Error(`${name}: the review fails ${criterion} without naming a gap`);
    }
  }
  for (const gap of review.gaps) {
    if (verdicts[gap.criterion] !== 'fail') {
      throw new Error(`${name}: the review names a ${gap.criterion} gap but does not fail ${gap.criterion}`);
    }
  }
  const checked = review.recheck ?? review;
  if (checked.skillBlob !== current.skillBlob || checked.rulesBlob !== current.rulesBlob) {
    throw new Error(`${name}: the result was neither converted nor rechecked under the current SKILL.md and rules`);
  }
  return { name, prompt, output, review };
}

/** Reads and parses a JSON file. */
function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Reads a prompt's chart or its out-of-scope verdict; throws when neither exists or the file is invalid. */
function readOutput(directory: string, name: string): CorpusEntry['output'] {
  const configPath = path.join(directory, `${name}.agent-logic.json`);
  const verdictPath = path.join(directory, RECORDS_DIRECTORY, `${name}.problems.json`);
  if (existsSync(configPath)) {
    const validated = validateConfig(readJson(configPath));
    if (!validated.ok) throw new Error(`${name}: ${configPath} is not a valid agent-logic file`);
    return { config: validated.config };
  }
  if (existsSync(verdictPath)) return { outOfScope: outOfScopeSchema.parse(readJson(verdictPath)).outOfScope };
  throw new Error(
    `${name}: neither ${name}.agent-logic.json nor an out-of-scope ${RECORDS_DIRECTORY}/${name}.problems.json exists`,
  );
}

/** Renders a converted prompt's row of the scorecard's table. */
function renderChartRow(entry: CorpusEntry, score: ChartScore): string {
  const { verdicts, convertRuns } = entry.review;
  const cells =
    'coverage' in verdicts
      ? [
          verdicts.coverage,
          verdicts.fidelity,
          verdicts.placement,
          verdicts.gates,
          verdicts.unconverted,
          verdicts.gapsReport,
        ]
      : ['', '', '', '', '', ''];
  return `| ${[
    entry.name,
    `\`${shortenId(entry.review.rulesBlob)}\``,
    convertRuns,
    score.states,
    score.transitions,
    score.inferred,
    score.ambient,
    score.unconverted,
    score.reportedGaps.length,
    formatPercent(score.coverage),
    ...cells,
  ].join(' | ')} |`;
}

/** Shortens a blob or commit id to its first 12 characters. */
function shortenId(id: string): string {
  return id.slice(0, 12);
}
// endregion | Helpers
