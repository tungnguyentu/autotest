import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { ensureFeatureDir, listFeatures, readFeature, readTestCases, writeFeature } from "../core/feature-store.ts";
import { featureDir, featureFile, testcasesFile, testsDir } from "../core/paths.ts";
import { readLast } from "../core/playwright-runner.ts";
import { loadRunData } from "../core/summary.ts";
import { findScreenshotSpec, readScreenState, undecidedCount } from "../core/ui-diff-store.ts";
import { parseFeature, TESTCASE_STATUSES, type Feature, type TestCase } from "../core/schemas.ts";
import { readSession, type SessionMeta } from "./auth.ts";
import { featureParam, HttpError, type ToolContext } from "./http.ts";
import { listRuns, resolveRunDir, type RunInfo } from "./runs.ts";
import { listUsecases, type UsecaseInfo } from "./usecases.ts";

type Counts = Record<(typeof TESTCASE_STATUSES)[number], number>;

function countByStatus(list: TestCase[]): Counts {
  const counts = Object.fromEntries(TESTCASE_STATUSES.map((s) => [s, 0])) as Counts;
  for (const t of list) counts[t.status]++;
  return counts;
}

/** Trạng thái từng test case cho ô "Bước tiếp theo": quyết định của tester và kết quả spec ở đợt mới nhất. */
export interface CaseProgress {
  id: string;
  status: TestCase["status"];
  has_spec: boolean;
  /** `null` nếu đợt mới nhất chưa có ai-run của test case này. */
  ai_run: { decision: "confirmed" | "rejected" | null; /** Đã run-finish. Chưa có kết quả thì tester chưa xác nhận được (API trả 409). */ has_result: boolean } | null;
  /** Kết quả lần chạy Playwright gần nhất của đợt mới nhất, `null` nếu spec chưa chạy. */
  spec_result: "passed" | "failed" | null;
}

function caseProgress(feature: string, list: TestCase[], latest: RunInfo | undefined, ctx: ToolContext): CaseProgress[] {
  const dir = latest ? resolveRunDir(feature, latest.name, ctx) : null;
  const aiRuns = new Map((dir ? loadRunData(dir).aiRuns : []).map((a) => [a.id, a]));
  const last = dir ? readLast(dir) : null;
  const tests = last?.tests ?? [];
  const ranAt = last ? Date.parse(last.finished_at) : 0;
  return list.map((t) => {
    const name = `${t.id}.spec.ts`;
    const mine = tests.filter((x) => x.file === name);
    const specFile = path.join(testsDir(feature, ctx), name);
    // Spec sửa sau lần chạy gần nhất thì kết quả không còn nói về spec hiện tại (đưa vào regression sẽ bị 409).
    const modifiedSince = fs.existsSync(specFile) && fs.statSync(specFile).mtimeMs > ranAt;
    const run = aiRuns.get(t.id);
    return {
      id: t.id,
      status: t.status,
      has_spec: fs.existsSync(specFile),
      ai_run: run ? { decision: run.tester.decision ?? null, has_result: Boolean(run.ai_result) } : null,
      spec_result: mine.length && !modifiedSince ? (mine.every((x) => x.status === "passed") ? "passed" : "failed") : null,
    };
  });
}

/** Tiến độ so UI của từng screen ở đợt mới nhất, cho ô "Bước tiếp theo". */
export interface UiDiffProgress {
  screen: string;
  has_figma: boolean;
  compared: boolean;
  /** Có report.md và report không cũ hơn lần so gần nhất. */
  has_report: boolean;
  undecided: number;
  has_spec: boolean;
  has_baseline: boolean;
}

function uiDiffProgress(feature: string, cfg: Feature, latest: RunInfo | undefined, ctx: ToolContext): UiDiffProgress[] {
  const dir = latest ? resolveRunDir(feature, latest.name, ctx) : null;
  return Object.keys(cfg.screens).map((screen) => {
    const state = dir && latest?.ui_diff_screens.includes(screen) ? readScreenState(dir, screen) : null;
    return {
      screen,
      has_figma: fs.existsSync(path.join(featureDir(feature, ctx), "figma", `${screen}.png`)),
      compared: Boolean(state?.metrics),
      has_report: Boolean(state?.report && !state.report.stale),
      undecided: state ? undecidedCount(state) : 0,
      has_spec: findScreenshotSpec(feature, screen, ctx) !== null,
      has_baseline: Boolean(state?.baseline),
    };
  });
}

export interface FeatureOverview {
  feature: Feature;
  usecases: UsecaseInfo[];
  testcases: { exists: boolean; total: number; counts: Counts; reviewed_ids: string[]; error?: string };
  session: SessionMeta | null;
  runs: RunInfo[];
  cases: CaseProgress[];
  ui_diff: UiDiffProgress[];
}

function overview(feature: string, ctx: ToolContext): FeatureOverview {
  const config = readFeature(feature, ctx);
  const exists = fs.existsSync(testcasesFile(feature, ctx));
  let list: TestCase[] = [];
  let error: string | undefined;
  const runs = listRuns(feature, ctx);
  try {
    list = readTestCases(feature, ctx);
  } catch (err) {
    error = (err as Error).message;
  }
  return {
    feature: config,
    usecases: listUsecases(feature, ctx),
    testcases: {
      exists,
      total: list.length,
      counts: countByStatus(list),
      reviewed_ids: list.filter((t) => t.status === "reviewed").map((t) => t.id),
      ...(error && { error }),
    },
    session: readSession(feature, ctx),
    runs,
    cases: caseProgress(feature, list, runs[0], ctx),
    ui_diff: uiDiffProgress(feature, config, runs[0], ctx),
  };
}

export function featuresRouter(ctx: ToolContext): Router {
  const r = Router();

  r.get("/", (_req, res) => {
    const rows = listFeatures(ctx).map((name) => {
      try {
        const o = overview(name, ctx);
        return {
          feature: name,
          service: o.feature.service,
          baseURL: o.feature.baseURL,
          testcases: o.testcases,
          session: o.session,
          latest_run: o.runs[0]?.name ?? null,
        };
      } catch (err) {
        return { feature: name, error: (err as Error).message };
      }
    });
    res.json(rows);
  });

  r.post("/", (req, res) => {
    const feature = parseFeature({ screens: {}, ...(req.body ?? {}) });
    if (fs.existsSync(featureFile(feature.feature, ctx))) {
      throw new HttpError(409, `Tính năng "${feature.feature}" đã có.`);
    }
    ensureFeatureDir(feature.feature, ctx);
    writeFeature(feature, ctx);
    res.status(201).json(feature);
  });

  r.get("/:f", (req, res) => {
    res.json(readFeature(featureParam(req), ctx));
  });

  r.get("/:f/overview", (req, res) => {
    res.json(overview(featureParam(req), ctx));
  });

  r.put("/:f", (req, res) => {
    const name = featureParam(req);
    readFeature(name, ctx); // 404 nếu chưa có
    const feature = parseFeature(req.body);
    if (feature.feature !== name) throw new HttpError(400, `Không đổi được tên tính năng (${name} -> ${feature.feature}).`);
    writeFeature(feature, ctx);
    res.json(feature);
  });

  return r;
}
