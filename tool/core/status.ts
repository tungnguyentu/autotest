import fs from "node:fs";
import path from "node:path";
import { listRunDirs } from "./ai-run-store.ts";
import { readFeature, readTestCases } from "./feature-store.ts";
import { authMetaFile, featureDir, publicUrl, testcasesFile, testsDir, type PathOptions } from "./paths.ts";
import { readLast } from "./playwright-runner.ts";
import { TESTCASE_STATUSES, type Feature, type TestCase } from "./schemas.ts";
import { loadRunData } from "./summary.ts";
import { findScreenshotSpec, readScreenState, undecidedCount } from "./ui-diff-store.ts";
import { listUsecases, type UsecaseInfo } from "./usecase-store.ts";

type Counts = Record<(typeof TESTCASE_STATUSES)[number], number>;

export interface SessionMeta {
  saved_at: string;
  final_url: string;
}

/** Thời điểm lưu phiên đăng nhập. Không đọc cookie hay token. */
export function readSession(feature: string, opts?: PathOptions): SessionMeta | null {
  try {
    const m = JSON.parse(fs.readFileSync(authMetaFile(feature, opts), "utf8")) as Record<string, unknown>;
    if (typeof m.saved_at !== "string") return null;
    return { saved_at: m.saved_at, final_url: typeof m.final_url === "string" ? publicUrl(m.final_url) : "" };
  } catch {
    return null;
  }
}

export interface CaseProgress {
  id: string;
  title: string;
  status: TestCase["status"];
  has_spec: boolean;
  /** `null` nếu đợt mới nhất chưa có ai-run của test case này. */
  ai_run: { decision: "confirmed" | "rejected" | null; has_result: boolean; verdict: string | null } | null;
  /** Kết quả lần chạy Playwright gần nhất của đợt mới nhất, `null` nếu chưa chạy hoặc spec đã sửa sau lần chạy. */
  spec_result: "passed" | "failed" | null;
}

export interface UiDiffProgress {
  screen: string;
  has_figma: boolean;
  compared: boolean;
  has_report: boolean;
  undecided: number;
  has_spec: boolean;
  has_baseline: boolean;
}

export interface FeatureStatus {
  feature: Feature;
  usecases: UsecaseInfo[];
  testcases: { exists: boolean; total: number; counts: Counts; error?: string };
  session: SessionMeta | null;
  latest_run: string | null;
  cases: CaseProgress[];
  ui_diff: UiDiffProgress[];
  next_step: string;
}

/** Trạng thái một tính năng và việc tiếp theo, để Claude trả lời tester "đang tới đâu". */
export function featureStatus(feature: string, opts?: PathOptions): FeatureStatus {
  const cfg = readFeature(feature, opts);
  const exists = fs.existsSync(testcasesFile(feature, opts));
  let list: TestCase[] = [];
  let error: string | undefined;
  try {
    list = readTestCases(feature, opts);
  } catch (err) {
    error = (err as Error).message;
  }
  const counts = Object.fromEntries(TESTCASE_STATUSES.map((s) => [s, 0])) as Counts;
  for (const t of list) counts[t.status]++;

  const runDir = listRunDirs(feature, opts)[0] ?? null;
  const aiRuns = new Map((runDir ? loadRunData(runDir).aiRuns : []).map((a) => [a.id, a]));
  const last = runDir ? readLast(runDir) : null;
  const ranAt = last ? Date.parse(last.finished_at) : 0;
  const cases: CaseProgress[] = list.map((t) => {
    const name = `${t.id}.spec.ts`;
    const specFile = path.join(testsDir(feature, opts), name);
    const mine = (last?.tests ?? []).filter((x) => x.file === name);
    const modifiedSince = fs.existsSync(specFile) && fs.statSync(specFile).mtimeMs > ranAt;
    const run = aiRuns.get(t.id);
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      has_spec: fs.existsSync(specFile),
      ai_run: run ? { decision: run.tester.decision ?? null, has_result: Boolean(run.ai_result), verdict: run.ai_result?.verdict ?? null } : null,
      spec_result: mine.length && !modifiedSince ? (mine.every((x) => x.status === "passed") ? "passed" : "failed") : null,
    };
  });

  const ui_diff: UiDiffProgress[] = Object.keys(cfg.screens).map((screen) => {
    const state = runDir && fs.existsSync(path.join(runDir, "ui-diff", screen)) ? readScreenState(runDir, screen) : null;
    return {
      screen,
      has_figma: fs.existsSync(path.join(featureDir(feature, opts), "figma", `${screen}.png`)),
      compared: Boolean(state?.metrics),
      has_report: Boolean(state?.report && !state.report.stale),
      undecided: state ? undecidedCount(state) : 0,
      has_spec: findScreenshotSpec(feature, screen, opts) !== null,
      has_baseline: Boolean(state?.baseline),
    };
  });

  const status: Omit<FeatureStatus, "next_step"> = {
    feature: cfg,
    usecases: listUsecases(feature, opts),
    testcases: { exists, total: list.length, counts, ...(error && { error }) },
    session: readSession(feature, opts),
    latest_run: runDir ? path.basename(runDir) : null,
    cases,
    ui_diff,
  };
  return { ...status, next_step: nextStep(status) };
}

/** Việc tiếp theo, viết cho tester đọc trong chat. Bước cần tester quyết định thì nói rõ tester cần trả lời gì. */
export function nextStep(o: Omit<FeatureStatus, "next_step">): string {
  const f = o.feature.feature;
  const t = o.testcases;
  if (/REPLACE-ME/i.test(o.feature.baseURL)) return `Cần địa chỉ môi trường thật (baseURL) cho tính năng ${f}. Tester gửi URL để Claude sửa feature.json.`;
  if (!o.usecases.length) return "Chưa có use case. Tester kéo file use case (.md hoặc .docx) vào chat.";
  if (!t.exists || t.total === 0) return "Claude sinh test case từ use case (skill gen-testcases).";
  if (t.counts.draft > 0) return `Tester duyệt ${t.counts.draft} test case draft: đọc rồi nói "duyệt <mã>" hoặc "duyệt hết", hoặc nêu chỗ cần sửa.`;

  const undecided = o.cases.filter((c) => c.status === "reviewed" && c.ai_run?.has_result && !c.ai_run.decision);
  if (undecided.length) return `Tester xem kết quả AI chạy thử của ${undecided.map((c) => c.id).join(", ")} rồi nói, ví dụ, "xác nhận ${undecided[0]!.id}" hoặc "từ chối ${undecided[0]!.id}, lý do ...".`;
  const unfinished = o.cases.filter((c) => c.status === "reviewed" && c.ai_run && !c.ai_run.has_result);
  if (unfinished.length) return `${unfinished[0]!.id} có lượt chạy thử chưa ghi kết quả. Claude chạy tiếp run-finish hoặc chạy thử lại.`;
  const pending = o.cases.filter((c) => c.status === "reviewed" && !c.ai_run);
  if (pending.length) {
    const needsAuth = Object.values(o.feature.screens).some((s) => s.auth);
    if (needsAuth && !o.session) return `Cần đăng nhập trước khi chạy thử. Tester nói "đăng nhập ${f}".`;
    return `Claude cho AI chạy thử ${pending.length} test case đã duyệt (skill run-testcase), bắt đầu từ ${pending[0]!.id}.`;
  }

  const passed = o.cases.filter((c) => c.status === "ai-passed");
  const noSpec = passed.find((c) => !c.has_spec);
  if (noSpec) return `Claude chuyển ${noSpec.id} sang Playwright (skill to-playwright).`;
  const notPassed = passed.find((c) => c.spec_result !== "passed");
  if (notPassed) {
    return notPassed.spec_result === "failed"
      ? `Spec của ${notPassed.id} fail. Tester phân loại: bug thật, locator hỏng hay UI đổi. Locator hỏng thì Claude đề xuất sửa (skill heal-locator).`
      : `Claude chạy spec của ${notPassed.id}.`;
  }
  if (passed.length) return `Spec của ${passed.map((c) => c.id).join(", ")} đã pass. Tester nói "đưa ${passed[0]!.id} vào regression" nếu đồng ý.`;

  for (const s of o.ui_diff.filter((x) => x.has_figma)) {
    if (!s.compared) return `Claude chụp và so screen "${s.screen}" với ảnh Figma (lệnh ui-diff).`;
    if (!s.has_report) return `Claude đánh giá sai khác của "${s.screen}" (skill ui-check).`;
    if (s.undecided > 0) return `Tester quyết định ${s.undecided} mục sai khác của "${s.screen}": mỗi mục là bug, chấp nhận hay cần xem.`;
    if (!s.has_baseline) {
      return s.has_spec
        ? `Đã quyết định hết mục của "${s.screen}". Tester nói "tạo baseline ${s.screen}" nếu UI khớp thiết kế.`
        : `"${s.screen}" cần một spec có toHaveScreenshot('${s.screen}.png') trước khi tạo baseline.`;
    }
  }
  if (o.cases.some((c) => c.status === "automated")) return "Chạy regression để kiểm tra các test case đã tự động hóa.";
  return `Chưa có việc tiếp theo. Muốn so UI với Figma: gửi ảnh export vào features/${f}/figma/<screen>.png. Không có Figma: kiểm tra giao diện bằng skill ui-audit.`;
}
