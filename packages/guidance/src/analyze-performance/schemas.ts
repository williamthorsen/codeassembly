/**
 * The documents that the performance helper reads and writes: the run manifest and the tool responses that it parses.
 */
import { z } from 'zod';

export const FORM_FACTORS = ['mobile', 'desktop'] as const;

export const TOOLS = ['psi', 'lighthouse'] as const;

export const FIELD_SOURCES = ['crux-api', 'psi'] as const;

const RunSchema = z.object({
  formFactor: z.enum(FORM_FACTORS),
  index: z.number().int().positive(),
  file: z.string().nullable(),
  error: z.string().nullable(),
});

const PageSchema = z.object({
  url: z.string().min(1),
  slug: z.string().min(1),
  private: z.boolean(),
  tool: z.enum(TOOLS),
  fallbackReason: z.string().nullable(),
  fieldSource: z.enum(FIELD_SOURCES).nullable(),
  fieldUnavailableReason: z.string().nullable(),
  crux: z.record(z.enum(FORM_FACTORS), z.string().nullable()),
  psiField: z.record(z.enum(FORM_FACTORS), z.string().nullable()),
  runs: z.array(RunSchema),
});

export const ManifestSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  lighthouseVersion: z.string(),
  runsPerFormFactor: z.number().int().positive(),
  pages: z.array(PageSchema),
});

/** The run manifest that `collect` writes and `summarize` reads. */
export type Manifest = z.infer<typeof ManifestSchema>;

/** One page's entry in the run manifest. */
export type ManifestPage = z.infer<typeof PageSchema>;

/** One run's entry in the run manifest. */
export type ManifestRun = z.infer<typeof RunSchema>;

/** The part of a Lighthouse audit result that the helper reads. */
export const AuditSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  score: z.number().nullable().optional(),
  scoreDisplayMode: z.string().optional(),
  numericValue: z.number().optional(),
  metricSavings: z.record(z.string(), z.number().optional()).optional(),
  details: z.unknown().optional(),
});

/** The part of a Lighthouse report (an LHR) that the helper reads. */
export const LighthouseReportSchema = z.object({
  lighthouseVersion: z.string(),
  runtimeError: z.object({ code: z.string(), message: z.string().optional() }).optional(),
  audits: z.record(z.string(), AuditSchema),
});

/** A Lighthouse report, narrowed to the fields that the helper reads. */
export type LighthouseReport = z.infer<typeof LighthouseReportSchema>;

const PsiMetricSchema = z.object({ percentile: z.number() });

const PsiLoadingExperienceSchema = z.object({
  metrics: z.record(z.string(), PsiMetricSchema).optional(),
  origin_fallback: z.boolean().optional(),
});

/** The part of a PageSpeed Insights v5 response that the helper reads. */
export const PsiResponseSchema = z.object({
  loadingExperience: PsiLoadingExperienceSchema.optional(),
  originLoadingExperience: PsiLoadingExperienceSchema.optional(),
  lighthouseResult: z.unknown(),
});

/** A PageSpeed Insights response's field-data block. */
export type PsiLoadingExperience = z.infer<typeof PsiLoadingExperienceSchema>;

const CruxMetricSchema = z.object({
  percentiles: z.object({ p75: z.union([z.number(), z.string()]) }),
});

/** A CrUX API `queryRecord` response, narrowed to its metrics. */
export const CruxRecordSchema = z.object({
  record: z.object({ metrics: z.record(z.string(), CruxMetricSchema) }),
});

/** A CrUX API record for the URL or the origin, either of which may be absent for lack of traffic. */
export const CruxFileSchema = z.object({
  url: CruxRecordSchema.nullable(),
  origin: CruxRecordSchema.nullable(),
});

/** The CrUX file that `collect` writes for one page and form factor. */
export type CruxFile = z.infer<typeof CruxFileSchema>;
