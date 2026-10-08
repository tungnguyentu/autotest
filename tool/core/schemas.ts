import { z } from "zod";
import { isFeatureName } from "./paths.ts";

const KEY = /^[a-z0-9][a-z0-9_-]*$/i;
const sizePair = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const isoWithOffset = z.iso.datetime({ offset: true });

// ---------- feature.json ----------

export const ScreenSchema = z.object({
  path: z.string().startsWith("/", "path phải bắt đầu bằng /"),
  auth: z.boolean().default(false),
  mask: z.array(z.string().min(1)).default([]),
  scale: z.number().positive().default(1),
  wait_for: z.array(z.string().min(1)).default([]),
});

export const FeatureSchema = z.object({
  feature: z
    .string()
    .regex(KEY, "chỉ dùng chữ, số, - và _")
    .refine(isFeatureName, "không được kết thúc bằng _r<số> (trùng với tên đợt vòng N)"),
  service: z.string().min(1),
  baseURL: z.url(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  screens: z.record(z.string().regex(KEY, "key screen chỉ dùng chữ, số, - và _"), ScreenSchema),
});

// ---------- testcases.json ----------

export const TESTCASE_STATUSES = ["draft", "reviewed", "ai-passed", "ai-failed", "automated"] as const;

export const TestCaseSchema = z.object({
  id: z.string().regex(KEY),
  title: z.string().min(1),
  screen: z.string().regex(KEY).optional(),
  preconditions: z.array(z.string()),
  steps: z.array(z.string()).min(1),
  expected: z.array(z.string()).min(1),
  priority: z.enum(["High", "Medium", "Low"]),
  type: z.enum(["positive", "negative", "boundary", "validation"]),
  status: z.enum(TESTCASE_STATUSES),
  manual: z.boolean().optional(),
  tester_note: z.string().optional(),
});

export const TestCasesSchema = z
  .array(TestCaseSchema)
  .refine((list) => new Set(list.map((t) => t.id)).size === list.length, "id test case bị trùng");

// ---------- ai-run/<id>.json ----------

export const AI_ACTIONS = [
  "navigate",
  "click",
  "fill",
  "press",
  "select",
  "check",
  "assert_text",
  "assert_url",
] as const;

export const VERDICTS = ["ĐẠT", "KHÔNG ĐẠT", "KHÔNG XÁC ĐỊNH"] as const;

const nullableText = z.string().nullable().default(null);

export const AiRunTargetSchema = z.object({
  role: nullableText,
  name: nullableText,
  label: nullableText,
  placeholder: nullableText,
  css: nullableText,
});

export const AiRunStepSchema = z.object({
  n: z.number().int().positive(),
  action: z.enum(AI_ACTIONS),
  target: AiRunTargetSchema.nullable().default(null),
  /** Giá trị nhập. Credential chỉ được ghi dạng <secret:TÊN_BIẾN>. */
  value: z.string().nullable().default(null),
  url_before: z.string().nullable().default(null),
  url_after: z.string().nullable().default(null),
  screenshot: z.string().nullable().default(null),
  note: z.string().default(""),
});

export const AiResultSchema = z.object({
  verdict: z.enum(VERDICTS),
  per_expected: z.array(
    z.object({
      expected: z.string(),
      verdict: z.enum(VERDICTS),
      observation: z.string(),
    }),
  ),
});

export const TesterDecisionSchema = z.object({
  decision: z.enum(["confirmed", "rejected"]).nullable().default(null),
  note: z.string().default(""),
  decided_at: isoWithOffset.nullable().default(null),
});

export const AiRunSchema = z.object({
  id: z.string().regex(KEY),
  feature: z.string().regex(KEY),
  baseURL: z.url(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  started_at: isoWithOffset,
  steps: z.array(AiRunStepSchema),
  ai_result: AiResultSchema.nullable().default(null),
  tester: TesterDecisionSchema.default({ decision: null, note: "", decided_at: null }),
});

// ---------- playwright-last.json ----------

export const PlaywrightTestResultSchema = z.object({
  /** Tên file spec, tương đối với tests/<feature>/. */
  file: z.string(),
  title: z.string(),
  status: z.enum(["passed", "failed", "flaky", "skipped"]),
  duration_ms: z.number().nonnegative(),
});

export const PlaywrightLastSchema = z.object({
  feature: z.string().regex(KEY),
  /** Đường dẫn spec đã chạy (tương đối với gốc project). `null` là chạy cả thư mục (regression). */
  spec: z.string().nullable(),
  /** `null` khi tiến trình bị dừng bằng tín hiệu. */
  exit_code: z.number().int().nullable(),
  stopped: z.boolean(),
  started_at: isoWithOffset,
  finished_at: isoWithOffset,
  tests: z.array(PlaywrightTestResultSchema),
});

// ---------- ui-diff/<screen>/metrics.json ----------

export const RegionSchema = z.object({
  id: z.number().int().positive(),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  changed_px: z.number().int().nonnegative(),
  crop: z.string().optional(),
});

export const MetricsSchema = z.object({
  screen: z.string().min(1),
  figma_size: sizePair,
  actual_size: sizePair,
  compared_size: sizePair,
  scale: z.number().positive(),
  threshold: z.number().int().min(0).max(255),
  diff_ratio: z.number().min(0).max(1),
  regions: z.array(RegionSchema),
  total_regions: z.number().int().nonnegative(),
  masked_boxes: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  note: z.string(),
});

// ---------- ui-diff/<screen>/meta.json, decisions.json, baseline.json ----------

export const MaskBoxSchema = z.object({
  selector: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});

export const MetaSchema = z.object({
  screen: z.string().min(1),
  captured_at: isoWithOffset,
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  full_page: z.boolean(),
  scale: z.number().positive(),
  url: z.string().optional(),
  final_url: z.string().optional(),
  /** Đường dẫn ảnh Figma gốc, tương đối với gốc project. Không có khi thiếu ảnh. */
  figma_source: z.string().optional(),
  figma_modified: isoWithOffset.optional(),
  mask_boxes: z.array(MaskBoxSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export const DECISION_VALUES = ["bug", "accept", "review"] as const;

export const DecisionsSchema = z.object({
  items: z.array(
    z.object({
      /** Số thứ tự dòng (từ 1) trong bảng "Sai khác đề xuất" của report.md. */
      index: z.number().int().positive(),
      decision: z.enum(DECISION_VALUES),
      note: z.string().max(10_000).default(""),
    }),
  ),
  decided_at: isoWithOffset,
  /** sha256 của report.md lúc lưu. Thiếu hoặc khác report hiện tại nghĩa là quyết định đã cũ. */
  report_hash: z.string().optional(),
});

export const BaselineSchema = z.object({
  created_at: isoWithOffset,
  figma_modified: isoWithOffset.nullable(),
  /** Spec đã chạy `--update-snapshots`, tương đối với gốc project. */
  spec: z.string(),
  /** Ảnh baseline, tương đối với gốc project. */
  screenshot: z.string(),
  run: z.string(),
  tester: z.string().default(""),
  /** Bản sao ảnh baseline trước lần chạy, tương đối với gốc project. `null` khi chưa có ảnh nào để sao. */
  backup: z.string().nullable().default(null),
});

// ---------- summary.md (frontmatter) ----------

/** Frontmatter YAML đầu file summary.md. Phần thân có mục "Kết luận của tester" do tester điền. */
export const SummaryFrontmatterSchema = z.object({
  feature: z.string().regex(KEY),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ngày dạng YYYY-MM-DD"),
  run: z.string().min(1),
  tester: z.string().default(""),
  environment: z.string().default(""),
  build: z.string().default(""),
});

// ---------- kiểu và hàm kiểm tra ----------

export type Feature = z.infer<typeof FeatureSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type AiRun = z.infer<typeof AiRunSchema>;
export type AiRunStep = z.infer<typeof AiRunStepSchema>;
export type PlaywrightLast = z.infer<typeof PlaywrightLastSchema>;
export type PlaywrightTestResult = z.infer<typeof PlaywrightTestResultSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type MaskBox = z.infer<typeof MaskBoxSchema>;
export type Decisions = z.infer<typeof DecisionsSchema>;
export type Baseline = z.infer<typeof BaselineSchema>;
export type SummaryFrontmatter = z.infer<typeof SummaryFrontmatterSchema>;

export class SchemaError extends Error {
  constructor(label: string, error: z.ZodError) {
    super(`${label} không hợp lệ:\n${z.prettifyError(error)}`);
    this.name = "SchemaError";
  }
}

function parser<S extends z.ZodType>(schema: S, label: string) {
  return (data: unknown): z.output<S> => {
    const result = schema.safeParse(data);
    if (!result.success) throw new SchemaError(label, result.error);
    return result.data;
  };
}

export const parseFeature = parser(FeatureSchema, "feature.json");
export const parseTestCases = parser(TestCasesSchema, "testcases.json");
export const parseAiRun = parser(AiRunSchema, "ai-run/<id>.json");
export const parseAiResult = parser(AiResultSchema, "ai_result (result-file)");
export const parsePlaywrightLast = parser(PlaywrightLastSchema, "playwright-last.json");
export const parseMetrics = parser(MetricsSchema, "metrics.json");
export const parseMeta = parser(MetaSchema, "meta.json");
export const parseDecisions = parser(DecisionsSchema, "decisions.json");
export const parseBaseline = parser(BaselineSchema, "baseline.json");
export const parseSummaryFrontmatter = parser(SummaryFrontmatterSchema, "summary.md (frontmatter)");
