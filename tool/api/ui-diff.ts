import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { captureScreens, type CaptureOptions } from "../cli/capture.ts";
import { compareDir } from "../cli/compare.ts";
import { backupBaselines, restoreOtherBaselines } from "../core/baseline-backup.ts";
import { readFeature } from "../core/feature-store.ts";
import { featureDir, localIso } from "../core/paths.ts";
import { RunnerBusyError, type PlaywrightRunner } from "../core/playwright-runner.ts";
import { DECISION_VALUES } from "../core/schemas.ts";
import { parseSummary } from "../core/summary.ts";
import {
  baselineBlockers,
  findScreenshotSpec,
  listScreenStates,
  readScreenState,
  screenDir,
  uiDiffRoot,
  writeBaseline,
  writeDecisions,
  type ScreenState,
} from "../core/ui-diff-store.ts";
import { featureParam, HttpError, type ToolContext } from "./http.ts";
import { resolveRun, resolveRunDir } from "./runs.ts";

export type UiDiffEvent =
  | { type: "ui-diff-state"; state: "running" | "finished"; feature: string; run: string; screens: string[]; error?: string }
  | {
      type: "ui-diff-progress";
      feature: string;
      run: string;
      screen: string;
      step: "capture" | "compare" | "baseline";
      state: "start" | "done" | "skipped" | "error";
      message?: string;
    };

export type CaptureFn = (options: CaptureOptions) => ReturnType<typeof captureScreens>;

const RunBody = z.object({
  run: z.string().min(1),
  screens: z.array(z.string().min(1)).min(1).optional(),
  fullPage: z.boolean().default(false),
});

const DecisionsBody = z.object({
  items: z.array(
    z.object({
      index: z.number().int().positive(),
      decision: z.enum(DECISION_VALUES),
      note: z.string().max(10_000).default(""),
    }),
  ),
});

interface Job {
  feature: string;
  run: string;
  screens: string[];
  controller: AbortController;
}

/**
 * API so UI với Figma. Chụp và so chạy trong tiến trình server, một lần một job: các screen lần lượt
 * chụp rồi so, tiến độ phát qua `emit` (SSE event `ui-diff`). Baseline chạy qua runner Playwright dùng chung.
 */
export function createUiDiff(ctx: ToolContext, runner: PlaywrightRunner, emit: (e: UiDiffEvent) => void, capture: CaptureFn = captureScreens) {
  let job: Job | null = null;

  const screenView = (feature: string, state: ScreenState) => {
    const spec = findScreenshotSpec(feature, state.screen, ctx);
    return {
      ...state,
      spec,
      blockers: baselineBlockers(state, feature, spec, Boolean(runner.running())),
    };
  };

  async function runJob(j: Job, runDir: string, fullPage: boolean): Promise<void> {
    const progress = (screen: string, step: "capture" | "compare", state: "start" | "done" | "skipped" | "error", message?: string) =>
      emit({ type: "ui-diff-progress", feature: j.feature, run: j.run, screen, step, state, ...(message && { message }) });
    emit({ type: "ui-diff-state", state: "running", feature: j.feature, run: j.run, screens: j.screens });
    let error: string | undefined;
    try {
      progress(j.screens[0]!, "capture", "start");
      await capture({
        ...ctx,
        feature: j.feature,
        out: uiDiffRoot(runDir),
        screens: j.screens,
        fullPage,
        signal: j.controller.signal,
        onScreen: (meta, dir) => {
          const captured = fs.existsSync(path.join(dir, "actual.png"));
          progress(meta.screen, "capture", captured ? "done" : "error", meta.warnings.join(" | ") || undefined);
          if (!captured) progress(meta.screen, "compare", "skipped", "Không có ảnh chụp để so.");
          else if (!fs.existsSync(path.join(dir, "figma.png"))) progress(meta.screen, "compare", "skipped", "Thiếu ảnh Figma, chưa so được.");
          else {
            progress(meta.screen, "compare", "start");
            try {
              const m = compareDir({ dir });
              progress(meta.screen, "compare", "done", `${m.total_regions} vùng khác, diff_ratio ${(m.diff_ratio * 100).toFixed(2)}%`);
            } catch (err) {
              progress(meta.screen, "compare", "error", (err as Error).message);
            }
          }
          const next = j.screens[j.screens.indexOf(meta.screen) + 1];
          if (next) progress(next, "capture", "start");
        },
      });
    } catch (err) {
      error = (err as Error).message;
    } finally {
      job = null;
      emit({ type: "ui-diff-state", state: "finished", feature: j.feature, run: j.run, screens: j.screens, ...(error && { error }) });
    }
  }

  // ---- /api/features/:f/ui-diff ----
  const featureRouter = Router({ mergeParams: true });

  featureRouter.post("/run", (req, res) => {
    const feature = featureParam(req);
    const body = RunBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, z.prettifyError(body.error));
    const runDir = resolveRunDir(feature, body.data.run, ctx);
    const cfg = readFeature(feature, ctx);
    const all = Object.keys(cfg.screens);
    if (!all.length) throw new HttpError(409, `Tính năng ${feature} chưa khai báo screen nào trong feature.json.`);
    const screens = body.data.screens ? [...new Set(body.data.screens)] : all;
    const unknown = screens.filter((s) => !cfg.screens[s]);
    if (unknown.length) throw new HttpError(400, `Screen không có trong feature.json: ${unknown.join(", ")}`);
    if (job) throw new HttpError(409, `Đang chụp và so (${job.feature}, ${job.screens.join(", ")}). Chờ xong.`);

    const j: Job = { feature, run: path.basename(runDir), screens, controller: new AbortController() };
    job = j;
    void runJob(j, runDir, body.data.fullPage);
    res.status(202).json({ feature, run: j.run, screens });
  });

  // ---- /api/runs/:run/ui-diff ----
  const runRouter = Router();

  runRouter.get("/:run/ui-diff", (req, res) => {
    const { feature, dir } = resolveRun(String(req.params.run), ctx);
    const cfg = readFeature(feature, ctx);
    const figmaDir = path.join(featureDir(feature, ctx), "figma");
    res.json({
      run: path.basename(dir),
      feature,
      running: job ? { feature: job.feature, run: job.run, screens: job.screens } : null,
      feature_screens: Object.entries(cfg.screens).map(([key, s]) => {
        const figma = path.join(figmaDir, `${key}.png`);
        return {
          key,
          path: s.path,
          auth: s.auth,
          has_figma: fs.existsSync(figma),
          figma_modified: fs.existsSync(figma) ? localIso(fs.statSync(figma).mtime) : null,
        };
      }),
      screens: listScreenStates(dir).map((s) => screenView(feature, s)),
    });
  });

  runRouter.post("/:run/ui-diff/:screen/decisions", (req, res) => {
    const { feature, dir } = resolveRun(String(req.params.run), ctx);
    const screen = String(req.params.screen);
    const state = loadScreen(dir, screen);
    const body = DecisionsBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, z.prettifyError(body.error));
    if (!state.report) throw new HttpError(409, `Chưa có report.md cho ${screen}. Chạy /ui-check ${feature} ${screen} trong Claude Code trước.`);
    const rows = state.report.rows.length;
    const seen = new Set<number>();
    for (const item of body.data.items) {
      if (item.index > rows) throw new HttpError(400, `Mục ${item.index} không có trong bảng (report.md có ${rows} mục).`);
      if (seen.has(item.index)) throw new HttpError(400, `Mục ${item.index} bị trùng.`);
      seen.add(item.index);
    }
    res.json(writeDecisions(dir, screen, body.data.items, localIso(), state.report.md));
  });

  runRouter.post("/:run/ui-diff/:screen/baseline", (req, res) => {
    const { feature, dir } = resolveRun(String(req.params.run), ctx);
    const screen = String(req.params.screen);
    const state = loadScreen(dir, screen);
    const spec = findScreenshotSpec(feature, screen, ctx);
    const blockers = baselineBlockers(state, feature, spec, Boolean(runner.running()));
    if (blockers.length || !spec) throw new HttpError(409, blockers.join(" "));

    const screenshot = `tests/__screenshots__/${feature}/${screen}.png`;
    const shotsDir = path.join(ctx.root, "tests", "__screenshots__", feature);
    const run = path.basename(dir);
    const progress = (s: "start" | "done" | "error", message?: string) =>
      emit({ type: "ui-diff-progress", feature, run, screen, step: "baseline", state: s, ...(message && { message }) });
    // `--update-snapshots` chạy cả spec nên có thể ghi đè ảnh của screen khác: sao lưu trước, khôi phục sau.
    const backupDir = backupBaselines(shotsDir, path.join(dir, "baseline-backup"));
    const toRel = (abs: string) => path.relative(ctx.root, abs).split(path.sep).join("/");
    try {
      const info = runner.start({
        feature,
        runDir: dir,
        spec,
        // Cờ cố định, không nhận từ client.
        extraArgs: ["--update-snapshots"],
        onFinish: (last) => {
          const shot = path.join(ctx.root, screenshot);
          const ok = Boolean(last && last.exit_code === 0 && !last.stopped);
          let restored: string[] = [];
          try {
            restored = restoreOtherBaselines(shotsDir, backupDir, ok ? `${screen}.png` : null);
          } catch (err) {
            progress("error", `Không khôi phục được baseline của screen khác: ${(err as Error).message}. Bản sao nằm ở ${backupDir ? toRel(backupDir) : "(không có)"}.`);
            return;
          }
          if (!last || last.exit_code !== 0 || last.stopped) {
            progress("error", `Playwright không chạy xong (mã thoát ${last?.exit_code ?? "không rõ"}). Xem playwright-log.txt của đợt.`);
          } else if (!fs.existsSync(shot)) {
            progress("error", `Spec chạy xong nhưng không tạo ${screenshot}. Kiểm tra spec có toHaveScreenshot('${screen}.png').`);
          } else {
            writeBaseline(dir, screen, {
              created_at: localIso(),
              figma_modified: state.meta?.figma_modified ?? null,
              spec,
              screenshot,
              run,
              tester: testerOf(dir),
              backup: backupDir ? toRel(backupDir) : null,
            });
            progress("done", restored.length ? `Đã giữ nguyên ảnh baseline của screen khác: ${restored.join(", ")}.` : undefined);
          }
        },
      });
      progress("start");
      res.status(202).json({ ...info, screen, screenshot });
    } catch (err) {
      if (backupDir) fs.rmSync(backupDir, { recursive: true, force: true });
      if (err instanceof RunnerBusyError) throw new HttpError(409, err.message);
      throw err;
    }
  });

  function loadScreen(dir: string, screen: string): ScreenState {
    try {
      screenDir(dir, screen);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    if (!fs.existsSync(path.join(uiDiffRoot(dir), screen))) throw new HttpError(404, `Không tìm thấy screen ${screen} trong ui-diff của đợt. Bấm "Chụp và so" trước.`);
    return readScreenState(dir, screen);
  }

  function testerOf(dir: string): string {
    try {
      return parseSummary(fs.readFileSync(path.join(dir, "summary.md"), "utf8")).front?.tester ?? "";
    } catch {
      return "";
    }
  }

  return {
    featureRouter,
    runRouter,
    /** Dừng job đang chạy (server tắt). Trình duyệt Chromium được đóng. */
    stop: () => job?.controller.abort(),
    running: () => job !== null,
  };
}

export type UiDiffService = ReturnType<typeof createUiDiff>;