import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "./feature-store.ts";
import { testsDir, type PathOptions } from "./paths.ts";
import {
  parseBaseline,
  parseDecisions,
  parseMeta,
  parseMetrics,
  type Baseline,
  type Decisions,
  type Meta,
  type Metrics,
} from "./schemas.ts";

const KEY = /^[a-z0-9][a-z0-9_-]*$/i;
const SPEC_NAME = /^[A-Za-z0-9_-]+\.spec\.ts$/;

export const uiDiffRoot = (runDir: string) => path.join(runDir, "ui-diff");

/** Thư mục của một screen trong đợt. Key screen sai bị từ chối trước khi thành đường dẫn. */
export function screenDir(runDir: string, screen: string): string {
  if (!KEY.test(screen)) throw new Error(`Key screen không hợp lệ: ${screen}`);
  return path.join(uiDiffRoot(runDir), screen);
}

// ---------- bảng "Sai khác đề xuất" trong report.md ----------

export interface ReportRow {
  /** Số thứ tự dòng trong bảng, từ 1. `decisions.json` tham chiếu theo số này. */
  index: number;
  region: string;
  item: string;
  figma: string;
  actual: string;
  level: string;
  kind: string;
}

/** Bỏ dấu, hạ chữ thường, để so tên cột và giá trị không phụ thuộc cách gõ. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

const COLUMNS: [keyof Omit<ReportRow, "index">, string, number][] = [
  ["region", "vung", 1],
  ["item", "hang muc", 2],
  ["figma", "figma", 3],
  ["actual", "thuc te", 4],
  ["level", "muc", 5],
  ["kind", "phan loai", 6],
];

/** Đọc bảng trong mục "## Sai khác đề xuất" của report.md. Không có mục hoặc không có bảng thì trả mảng rỗng. */
export function parseReportRows(md: string): ReportRow[] {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+/.test(l) && fold(l).replace(/^##\s+/, "").startsWith("sai khac de xuat"));
  if (start < 0) return [];
  const tableLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (line.trim().startsWith("|")) tableLines.push(line);
  }
  const [header, ...body] = tableLines;
  if (!header) return [];
  const names = splitRow(header).map(fold);
  const col = (name: string, fallback: number) => {
    const i = names.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const positions = COLUMNS.map(([key, name, fallback]) => [key, col(name, fallback)] as const);
  const rows: ReportRow[] = [];
  for (const line of body) {
    const cells = splitRow(line);
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const row = { index: rows.length + 1 } as ReportRow;
    for (const [key, i] of positions) row[key] = cells[i] ?? "";
    rows.push(row);
  }
  return rows;
}

export interface LevelCounts {
  high: number;
  medium: number;
  low: number;
  /** Dòng không phải "Sai khác thật" (có thể chấp nhận, cần tester xác nhận). */
  other: number;
}

export function countByLevel(rows: ReportRow[]): LevelCounts {
  const out: LevelCounts = { high: 0, medium: 0, low: 0, other: 0 };
  for (const r of rows) {
    if (fold(r.kind) !== "sai khac that") {
      out.other++;
      continue;
    }
    const level = fold(r.level);
    if (level === "cao") out.high++;
    else if (level === "trung binh" || level === "tb") out.medium++;
    else out.low++; // "Thấp" và mọi mức không nhận ra được tính vào mức thấp nhất, không bỏ sót dòng
  }
  return out;
}

export function describeLevels(c: LevelCounts): string {
  const base = `Cao ${c.high} / TB ${c.medium} / Thấp ${c.low}`;
  return c.other ? `${base}, ${c.other} mục chấp nhận hoặc cần xác nhận` : base;
}

// ---------- đọc trạng thái một screen ----------

/** Mã băm nội dung report.md. `decisions.json` lưu mã này để biết quyết định áp cho báo cáo nào. */
export const hashReport = (md: string): string => createHash("sha256").update(md).digest("hex");

export interface ScreenState {
  screen: string;
  meta: Meta | null;
  metrics: Metrics | null;
  report: { md: string; rows: ReportRow[]; stale: boolean } | null;
  decisions: Decisions | null;
  /** Có quyết định nhưng report.md đã đổi (hoặc quyết định không ghi mã băm): không còn áp dụng. */
  decisions_stale: boolean;
  baseline: Baseline | null;
  files: { actual: boolean; figma: boolean; diff: boolean; side_by_side: boolean };
  /** File trong thư mục screen không đọc được hoặc sai schema. */
  problems: string[];
}

function readJsonFile<T>(file: string, label: string, parse: (d: unknown) => T, problems: string[]): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (err) {
    problems.push(`${label} không đọc được: ${(err as Error).message.split("\n")[0]}`);
    return null;
  }
}

export function readScreenState(runDir: string, screen: string): ScreenState {
  const dir = screenDir(runDir, screen);
  const problems: string[] = [];
  const metrics = readJsonFile(path.join(dir, "metrics.json"), "metrics.json", parseMetrics, problems);
  let report: ScreenState["report"] = null;
  const reportFile = path.join(dir, "report.md");
  if (fs.existsSync(reportFile)) {
    const md = fs.readFileSync(reportFile, "utf8");
    const metricsFile = path.join(dir, "metrics.json");
    // Report viết trước lần so gần nhất thì mô tả ảnh cũ.
    const stale = fs.existsSync(metricsFile) && fs.statSync(reportFile).mtimeMs < fs.statSync(metricsFile).mtimeMs;
    report = { md, rows: parseReportRows(md), stale };
  }
  const has = (name: string) => fs.existsSync(path.join(dir, name));
  const decisions = readJsonFile(path.join(dir, "decisions.json"), "decisions.json", parseDecisions, problems);
  return {
    screen,
    meta: readJsonFile(path.join(dir, "meta.json"), "meta.json", parseMeta, problems),
    metrics,
    report,
    decisions,
    decisions_stale: Boolean(decisions && (!report || decisions.report_hash !== hashReport(report.md))),
    baseline: readJsonFile(path.join(dir, "baseline.json"), "baseline.json", parseBaseline, problems),
    files: { actual: has("actual.png"), figma: has("figma.png"), diff: has("diff.png"), side_by_side: has("side_by_side.png") },
    problems,
  };
}

/** Mọi screen có thư mục trong `<đợt>/ui-diff/`, theo tên. */
export function listScreenStates(runDir: string): ScreenState[] {
  const root = uiDiffRoot(runDir);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && KEY.test(e.name))
    .map((e) => readScreenState(runDir, e.name))
    .sort((a, b) => a.screen.localeCompare(b.screen));
}

// ---------- ghi ----------

export function writeDecisions(runDir: string, screen: string, items: Decisions["items"], decidedAt: string, reportMd: string): Decisions {
  const data = parseDecisions({ items: [...items].sort((a, b) => a.index - b.index), decided_at: decidedAt, report_hash: hashReport(reportMd) });
  writeJsonAtomic(path.join(screenDir(runDir, screen), "decisions.json"), data);
  return data;
}

export function writeBaseline(runDir: string, screen: string, baseline: Baseline): Baseline {
  const data = parseBaseline(baseline);
  writeJsonAtomic(path.join(screenDir(runDir, screen), "baseline.json"), data);
  return data;
}

// ---------- baseline ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Spec trong `tests/<feature>/` có `toHaveScreenshot('<screen>.png')`, dạng `tests/<feature>/<file>`. Không có thì null. */
export function findScreenshotSpec(feature: string, screen: string, opts?: PathOptions): string | null {
  const dir = testsDir(feature, opts);
  if (!fs.existsSync(dir)) return null;
  const re = new RegExp(`toHaveScreenshot\\(\\s*(['"\`])${escapeRe(screen)}\\.png\\1`);
  for (const name of fs.readdirSync(dir).filter((n) => SPEC_NAME.test(n)).sort()) {
    if (re.test(fs.readFileSync(path.join(dir, name), "utf8"))) return `tests/${feature}/${name}`;
  }
  return null;
}

/** Số mục trong bảng chưa có quyết định của tester. Quyết định của report cũ không tính. */
export function undecidedCount(state: ScreenState): number {
  const decided = new Set(state.decisions_stale ? [] : (state.decisions?.items ?? []).map((i) => i.index));
  return (state.report?.rows ?? []).filter((r) => !decided.has(r.index)).length;
}

/** Số mục tester đánh dấu Bug trong quyết định còn hiệu lực. */
export function bugCount(state: ScreenState): number {
  if (state.decisions_stale) return 0;
  return (state.decisions?.items ?? []).filter((i) => i.decision === "bug").length;
}

/** Lý do chưa tạo được baseline. Mảng rỗng nghĩa là đủ điều kiện. Còn mục "bug" thì chặn. "cần xem" tính là đã quyết định. */
export function baselineBlockers(state: ScreenState, feature: string, spec: string | null, runnerBusy: boolean): string[] {
  const out: string[] = [];
  if (!spec) out.push(`Chưa có spec trong tests/${feature}/ dùng toHaveScreenshot('${state.screen}.png'). Viết spec trước (chạy /to-playwright hoặc viết tay).`);
  if (!state.metrics) out.push("Chưa có kết quả so ảnh. Bấm \"Chụp và so\" trước.");
  if (!state.report) out.push(`Chưa có report.md. Chạy /ui-check ${feature} ${state.screen} trong Claude Code.`);
  else if (state.report.stale) out.push(`report.md cũ hơn lần so gần nhất. Chạy lại /ui-check ${feature} ${state.screen}.`);
  else if (state.decisions_stale) out.push("report.md đã đổi sau khi tester lưu quyết định, cần quyết định lại cho từng mục rồi bấm \"Lưu quyết định\".");
  else if (!state.decisions) out.push("Tester chưa lưu quyết định. Chọn bug, chấp nhận hoặc cần xem cho từng mục rồi bấm \"Lưu quyết định\".");
  else if (undecidedCount(state) > 0) {
    out.push(`Tester chưa quyết định hết mọi mục (còn ${undecidedCount(state)} mục).`);
  } else if (bugCount(state) > 0) {
    out.push(`Còn ${bugCount(state)} mục đánh dấu Bug. Sửa UI rồi chụp và so lại, hoặc đổi quyết định, trước khi tạo baseline.`);
  }
  if (runnerBusy) out.push("Playwright đang chạy. Chờ xong hoặc bấm Dừng.");
  return out;
}
