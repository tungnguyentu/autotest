import fs from "node:fs";
import path from "node:path";
import { readFeature, readTestCases, writeTextAtomic } from "./feature-store.ts";
import { featureDir, type PathOptions } from "./paths.ts";
import { readLast } from "./playwright-runner.ts";
import { parseAiRun, SummaryFrontmatterSchema, type AiRun, type Feature, type PlaywrightLast, type SummaryFrontmatter, type TestCase } from "./schemas.ts";
import { countByLevel, describeLevels, listScreenStates, type ScreenState } from "./ui-diff-store.ts";

export const CONCLUSION_HEADING = "## Kết luận của tester";
export const CONCLUSION_PLACEHOLDER = "<!-- để trống — tester điền -->";

export interface RunData {
  aiRuns: AiRun[];
  /** Mỗi screen có thư mục trong ui-diff/. `metrics` null nghĩa là chưa so được (thiếu ảnh Figma, lỗi chụp). */
  uiDiffs: ScreenState[];
  /** Kết quả `playwright-last.json` của đợt, hoặc null nếu chưa chạy Playwright. */
  playwright: PlaywrightLast | null;
  /** File trong đợt không đọc được hoặc sai schema. Đưa vào mục "Vấn đề kỹ thuật". */
  problems: string[];
}

export interface SummaryInput {
  feature: Feature;
  front: SummaryFrontmatter;
  testcases: TestCase[];
  data: RunData;
  conclusion: string;
  /** Ngày ảnh Figma mới nhất được export (theo mtime), hoặc null nếu chưa có ảnh. */
  figmaExported: string | null;
}

// ---------- đọc dữ liệu của đợt ----------

function readJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
}

/** Đọc các file ai-run và dữ liệu ui-diff của từng screen. File lỗi được ghi vào `problems`, không làm sinh summary thất bại. */
export function loadRunData(runDir: string): RunData {
  const data: RunData = { aiRuns: [], uiDiffs: [], playwright: readLast(runDir), problems: [] };
  for (const name of readJsonFiles(path.join(runDir, "ai-run"))) {
    try {
      data.aiRuns.push(parseAiRun(JSON.parse(fs.readFileSync(path.join(runDir, "ai-run", name), "utf8"))));
    } catch (err) {
      data.problems.push(`ai-run/${name} không đọc được: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  for (const state of listScreenStates(runDir)) {
    data.uiDiffs.push(state);
    for (const p of state.problems) data.problems.push(`ui-diff/${state.screen}/${p}`);
  }
  return data;
}

// ---------- sinh và đọc summary.md ----------

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

function table(header: string[], rows: string[][]): string {
  const line = (cols: string[]) => `| ${cols.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map((r) => line(r.map(cell)))].join("\n");
}

const DECISION_LABEL = { confirmed: "Đã xác nhận", rejected: "Từ chối" } as const;
const PLAYWRIGHT_LABEL = { passed: "pass", failed: "fail", flaky: "flaky", skipped: "bỏ qua" } as const;

/** Kết quả Playwright của spec `<id>.spec.ts` trong lần chạy gần nhất của đợt. */
function playwrightCell(last: PlaywrightLast | null, id: string): string {
  const mine = (last?.tests ?? []).filter((t) => t.file === `${id}.spec.ts`);
  if (!mine.length) return "chưa chạy";
  return [...new Set(mine.map((t) => PLAYWRIGHT_LABEL[t.status]))].join(", ");
}

/** Hàng bảng "Test case": AI đề xuất, quyết định của tester, kết quả Playwright. */
function testCaseRows(input: SummaryInput): string[][] {
  const titles = new Map(input.testcases.map((t) => [t.id, t.title]));
  const order = new Map(input.testcases.map((t, i) => [t.id, i]));
  return [...input.data.aiRuns]
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.id.localeCompare(b.id))
    .map((r) => [
      r.id,
      titles.get(r.id) ?? "(không có trong testcases.json)",
      r.ai_result?.verdict ?? "chưa đánh giá",
      r.tester.decision ? DECISION_LABEL[r.tester.decision] : "chưa quyết",
      playwrightCell(input.data.playwright, r.id),
      `ai-run/${r.id}.json`,
    ]);
}

/** Hàng bảng "UI check": số sai khác theo mức từ report.md, hoặc "chưa đánh giá" khi skill chưa ghi report. */
function uiCheckRows(input: SummaryInput): string[][] {
  return [...input.data.uiDiffs]
    .sort((a, b) => a.screen.localeCompare(b.screen))
    .map((s) => {
      const link = s.report ? `ui-diff/${s.screen}/report.md` : "chưa có";
      if (!s.metrics) return [s.screen, "chưa so được (xem Vấn đề kỹ thuật)", link];
      const pixels = `${s.metrics.total_regions} vùng pixel khác, diff_ratio ${(s.metrics.diff_ratio * 100).toFixed(2)}%`;
      if (!s.report) return [s.screen, `chưa đánh giá (${pixels})`, link];
      const levels = describeLevels(countByLevel(s.report.rows));
      return [s.screen, s.report.stale ? `${levels} (report cũ hơn lần so gần nhất)` : levels, link];
    });
}

function technicalIssues(input: SummaryInput): string[] {
  const issues = [...input.data.problems];
  for (const s of input.data.uiDiffs) {
    for (const w of s.metrics?.warnings ?? s.meta?.warnings ?? []) issues.push(`${s.screen}: ${w}`);
  }
  return issues;
}

function renderFrontmatter(f: SummaryFrontmatter): string {
  const q = (v: string) => JSON.stringify(v);
  return [
    "---",
    `feature: ${q(f.feature)}`,
    `date: ${q(f.date)}`,
    `run: ${q(f.run)}`,
    `tester: ${q(f.tester)}`,
    `environment: ${q(f.environment)}`,
    `build: ${q(f.build)}`,
    "---",
  ].join("\n");
}

export function renderSummary(input: SummaryInput): string {
  const { feature, front } = input;
  const issues = technicalIssues(input);
  const tcRows = testCaseRows(input);
  const uiRows = uiCheckRows(input);
  const conclusion = input.conclusion.trim() || CONCLUSION_PLACEHOLDER;
  return [
    renderFrontmatter(front),
    "",
    `# Đợt test ${front.run}`,
    "",
    `- Tính năng: ${feature.feature} · Service: ${feature.service} · Môi trường: ${front.environment || feature.baseURL}`,
    `- Build / commit: ${front.build || "(tester điền)"} · Tester: ${front.tester || "(tester điền)"}`,
    `- Ảnh Figma dùng: ${input.figmaExported ? `ngày export ${input.figmaExported}` : "chưa có ảnh Figma"}`,
    "",
    "## Test case (AI đề xuất)",
    table(["ID", "Tiêu đề", "AI đề xuất", "Quyết định tester", "Playwright", "Evidence"], tcRows),
    "",
    "## UI check (AI đề xuất)",
    table(["Screen", "Số sai khác (Cao/TB/Thấp)", "Báo cáo"], uiRows),
    "",
    "## Vấn đề kỹ thuật",
    ...(issues.length ? issues.map((i) => `- ${i}`) : ["- Không có"]),
    "",
    CONCLUSION_HEADING,
    conclusion,
    "",
  ].join("\n");
}

export interface ParsedSummary {
  front: SummaryFrontmatter | null;
  conclusion: string;
}

/** Tách frontmatter và nội dung mục "Kết luận của tester". Không ném lỗi với file tay sửa. */
export function parseSummary(md: string): ParsedSummary {
  let front: SummaryFrontmatter | null = null;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(md);
  if (m) {
    const raw: Record<string, unknown> = {};
    for (const line of m[1]!.split(/\r?\n/)) {
      const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
      if (!kv) continue;
      let v: unknown = kv[2];
      try {
        v = JSON.parse(kv[2]!);
      } catch {
        // giá trị YAML không có nháy: dùng nguyên chuỗi
      }
      raw[kv[1]!] = v;
    }
    const r = SummaryFrontmatterSchema.safeParse(raw);
    if (r.success) front = r.data;
  }
  // Tiêu đề phải ở đầu dòng: cùng chuỗi nằm giữa dòng bảng (tiêu đề test case do AI sinh) không phải ranh giới.
  const heading = new RegExp(`^${CONCLUSION_HEADING}[ \\t]*$`, "m").exec(md);
  let conclusion = heading ? md.slice(heading.index + heading[0].length).trim() : "";
  if (conclusion === CONCLUSION_PLACEHOLDER) conclusion = "";
  return { front, conclusion };
}

// ---------- ghép với đĩa ----------

export interface SummaryOverrides {
  conclusion?: string;
  tester?: string;
  environment?: string;
  build?: string;
}

function figmaExportDate(feature: string, opts?: PathOptions): string | null {
  const dir = path.join(featureDir(feature, opts), "figma");
  if (!fs.existsSync(dir)) return null;
  let newest = 0;
  for (const n of fs.readdirSync(dir)) {
    if (n.toLowerCase().endsWith(".png")) newest = Math.max(newest, fs.statSync(path.join(dir, n)).mtimeMs);
  }
  if (!newest) return null;
  const d = new Date(newest);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Sinh nội dung summary.md cho một đợt. Giữ nguyên frontmatter và "Kết luận của tester"
 * của file hiện có, trừ phần `overrides`. Không ghi file.
 */
export function buildSummaryText(feature: string, runDir: string, overrides: SummaryOverrides = {}, opts?: PathOptions): string {
  const cfg = readFeature(feature, opts);
  const file = path.join(runDir, "summary.md");
  const previous = fs.existsSync(file) ? parseSummary(fs.readFileSync(file, "utf8")) : { front: null, conclusion: "" };
  const run = path.basename(runDir);
  const date = /^\d{4}-\d{2}-\d{2}/.exec(run)?.[0] ?? "";
  const base: SummaryFrontmatter = previous.front ?? {
    feature,
    date,
    run,
    tester: "",
    environment: cfg.baseURL,
    build: "",
  };
  const front = SummaryFrontmatterSchema.parse({
    ...base,
    feature,
    date,
    run,
    ...(overrides.tester !== undefined && { tester: overrides.tester }),
    ...(overrides.environment !== undefined && { environment: overrides.environment }),
    ...(overrides.build !== undefined && { build: overrides.build }),
  });
  return renderSummary({
    feature: cfg,
    front,
    testcases: readTestCases(feature, opts),
    data: loadRunData(runDir),
    conclusion: overrides.conclusion ?? previous.conclusion,
    figmaExported: figmaExportDate(feature, opts),
  });
}

/** Sinh lại và ghi summary.md. Thư mục đợt phải tồn tại. */
export function writeSummary(feature: string, runDir: string, overrides: SummaryOverrides = {}, opts?: PathOptions): string {
  if (!fs.existsSync(runDir)) throw new Error(`Không tìm thấy thư mục đợt: ${runDir}`);
  const text = buildSummaryText(feature, runDir, overrides, opts);
  writeTextAtomic(path.join(runDir, "summary.md"), text);
  return text;
}
