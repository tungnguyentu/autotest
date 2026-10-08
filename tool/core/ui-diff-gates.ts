import fs from "node:fs";
import path from "node:path";
import { captureScreens } from "../cli/capture.ts";
import { compareDir } from "../cli/compare.ts";
import { runPlaywright, type RunPlaywrightOptions } from "../cli/run-spec.ts";
import { backupBaselines, restoreOtherBaselines } from "./baseline-backup.ts";
import { localIso, PROJECT_ROOT, type PathOptions } from "./paths.ts";
import { ReviewError } from "./review.ts";
import type { Decisions } from "./schemas.ts";
import { parseSummary } from "./summary.ts";
import {
  baselineBlockers,
  findScreenshotSpec,
  readScreenState,
  screenDir,
  uiDiffRoot,
  writeBaseline,
  writeDecisions,
  type ScreenState,
} from "./ui-diff-store.ts";

export interface UiDiffScreenResult {
  screen: string;
  captured: boolean;
  compared: boolean;
  regions?: number;
  diff_ratio?: number;
  warnings: string[];
}

/** Chụp từng screen rồi so với ảnh Figma (thay cho nút "Chụp và so"). Thiếu ảnh Figma thì chỉ chụp và cảnh báo. */
export async function runUiDiff(opts: PathOptions & { feature: string; runDir: string; screens?: string[]; fullPage?: boolean; headed?: boolean }): Promise<UiDiffScreenResult[]> {
  const out: UiDiffScreenResult[] = [];
  await captureScreens({
    ...opts,
    out: uiDiffRoot(opts.runDir),
    onScreen: (meta, dir) => {
      const r: UiDiffScreenResult = { screen: meta.screen, captured: fs.existsSync(path.join(dir, "actual.png")), compared: false, warnings: [...meta.warnings] };
      if (r.captured && fs.existsSync(path.join(dir, "figma.png"))) {
        try {
          const m = compareDir({ dir });
          Object.assign(r, { compared: true, regions: m.total_regions, diff_ratio: m.diff_ratio });
        } catch (err) {
          r.warnings.push(`Lỗi khi so: ${(err as Error).message}`);
        }
      }
      out.push(r);
    },
  });
  return out;
}

function loadScreen(runDir: string, screen: string): ScreenState {
  try {
    screenDir(runDir, screen);
  } catch (err) {
    throw new ReviewError((err as Error).message);
  }
  if (!fs.existsSync(path.join(uiDiffRoot(runDir), screen))) {
    throw new ReviewError(`Không có screen ${screen} trong ui-diff của đợt ${path.basename(runDir)}. Chạy lệnh ui-diff trước.`);
  }
  return readScreenState(runDir, screen);
}

/** Tester quyết định từng mục trong bảng sai khác của `report.md` (bug, accept, review). */
export function saveUiDecisions(runDir: string, screen: string, items: Decisions["items"]): Decisions {
  const state = loadScreen(runDir, screen);
  if (!state.report) throw new ReviewError(`Chưa có report.md cho ${screen}. Chạy skill ui-check trước.`);
  const rows = state.report.rows.length;
  const seen = new Set<number>();
  for (const item of items) {
    if (item.index < 1 || item.index > rows) throw new ReviewError(`Mục ${item.index} không có trong bảng (report.md có ${rows} mục).`);
    if (seen.has(item.index)) throw new ReviewError(`Mục ${item.index} bị trùng.`);
    seen.add(item.index);
  }
  return writeDecisions(runDir, screen, items, localIso(), state.report.md);
}

function testerOf(runDir: string): string {
  try {
    return parseSummary(fs.readFileSync(path.join(runDir, "summary.md"), "utf8")).front?.tester ?? "";
  } catch {
    return "";
  }
}

/**
 * Tạo baseline cho một screen khi tester đồng ý: chạy `--update-snapshots` cho spec có `toHaveScreenshot('<screen>.png')`.
 * Giữ nguyên ảnh baseline của screen khác. Bị chặn khi còn mục chưa quyết định hoặc còn mục bug.
 */
export async function createBaseline(opts: Omit<RunPlaywrightOptions, "spec" | "extraArgs"> & { screen: string }) {
  const { feature, runDir, screen } = opts;
  const root = opts.root ?? PROJECT_ROOT;
  const state = loadScreen(runDir, screen);
  const spec = findScreenshotSpec(feature, screen, opts);
  const blockers = baselineBlockers(state, feature, spec, false);
  if (blockers.length || !spec) throw new ReviewError(blockers.join(" "));

  const screenshot = `tests/__screenshots__/${feature}/${screen}.png`;
  const shotsDir = path.join(root, "tests", "__screenshots__", feature);
  const toRel = (abs: string) => path.relative(root, abs).split(path.sep).join("/");
  // `--update-snapshots` chạy cả spec nên có thể ghi đè ảnh của screen khác: sao lưu trước, khôi phục sau.
  const backupDir = backupBaselines(shotsDir, path.join(runDir, "baseline-backup"));
  let last;
  try {
    last = await runPlaywright({ ...opts, spec, extraArgs: ["--update-snapshots"] });
  } catch (err) {
    if (backupDir) fs.rmSync(backupDir, { recursive: true, force: true });
    throw err;
  }
  const ok = Boolean(last && last.exit_code === 0 && !last.stopped);
  const restored = restoreOtherBaselines(shotsDir, backupDir, ok ? `${screen}.png` : null);
  if (!ok) throw new ReviewError(`Playwright không chạy xong (mã thoát ${last?.exit_code ?? "không rõ"}). Xem playwright-log.txt của đợt.`);
  if (!fs.existsSync(path.join(root, screenshot))) {
    throw new ReviewError(`Spec chạy xong nhưng không tạo ${screenshot}. Kiểm tra spec có toHaveScreenshot('${screen}.png').`);
  }
  const baseline = writeBaseline(runDir, screen, {
    created_at: localIso(),
    figma_modified: state.meta?.figma_modified ?? null,
    spec,
    screenshot,
    run: path.basename(runDir),
    tester: testerOf(runDir),
    backup: backupDir ? toRel(backupDir) : null,
  });
  return { baseline, restored };
}
