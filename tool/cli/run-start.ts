import fs from "node:fs";
import path from "node:path";
import { runAgentBrowser, sessionName } from "../core/agent-browser.ts";
import { aiRunFile, createAiRun, latestRunDirOfDay, resolveRunDirOption } from "../core/ai-run-store.ts";
import { readFeature, readTestCases } from "../core/feature-store.ts";
import { authFile, createRunDir, localIso, type PathOptions } from "../core/paths.ts";

export interface RunStartOptions extends PathOptions {
  feature: string;
  id: string;
  runDir?: string;
  /** Cho chạy test case chưa `reviewed` hoặc đánh dấu `manual`. */
  force?: boolean;
  env?: NodeJS.ProcessEnv;
  date?: string;
}

export interface RunStartResult {
  runDir: string;
  aiRunPath: string;
  session: string;
  baseURL: string;
  viewport: { width: number; height: number };
  authFile: string | null;
  warnings: string[];
}

/**
 * Mở một ai-run: kiểm tra test case, chọn hoặc tạo thư mục đợt, tạo ai-run/<id>.json rỗng,
 * đóng session agent-browser cũ của tính năng để lần chạy này bắt đầu từ trình duyệt sạch.
 */
export async function runStart(opts: RunStartOptions): Promise<RunStartResult> {
  const feature = readFeature(opts.feature, opts);
  const tc = readTestCases(opts.feature, opts).find((t) => t.id === opts.id);
  if (!tc) throw new Error(`Không có test case ${opts.id} trong features/${opts.feature}/testcases.json.`);

  const warnings: string[] = [];
  if (tc.status !== "reviewed") {
    const msg = `Test case ${opts.id} có status "${tc.status}", chỉ chạy test case "reviewed".`;
    if (!opts.force) throw new Error(`${msg} Tester duyệt trên UI trước, hoặc dùng --force nếu tester đã đồng ý.`);
    warnings.push(`${msg} Đang chạy vì có --force.`);
  }
  if (tc.manual) {
    const msg = `Test case ${opts.id} đánh dấu manual (cần OTP hoặc captcha), AI không chạy.`;
    if (!opts.force) throw new Error(`${msg} Dùng --force nếu tester đã đồng ý.`);
    warnings.push(`${msg} Đang chạy vì có --force.`);
  }

  let runDir: string;
  if (opts.runDir) {
    runDir = resolveRunDirOption(opts.runDir, opts);
    fs.mkdirSync(runDir, { recursive: true });
  } else {
    const latest = latestRunDirOfDay(opts.feature, opts.date, opts);
    runDir = latest && !fs.existsSync(aiRunFile(latest, opts.id)) ? latest : createRunDir(opts.feature, opts);
  }

  const run = createAiRun(runDir, {
    id: opts.id,
    feature: opts.feature,
    baseURL: feature.baseURL,
    viewport: feature.viewport,
    started_at: localIso(),
  });

  const auth = authFile(opts.feature, opts);
  const hasAuth = fs.existsSync(auth);
  if (!hasAuth && Object.values(feature.screens).some((s) => s.auth)) {
    warnings.push(`Chưa có auth/${opts.feature}.json. Tính năng có screen cần đăng nhập, nhờ tester chạy lệnh login.`);
  }

  try {
    await runAgentBrowser({ feature: opts.feature, env: opts.env, timeoutMs: 15_000 }, ["close"]);
  } catch (err) {
    warnings.push(`Không đóng được session cũ: ${(err as Error).message}`);
  }

  return {
    runDir,
    aiRunPath: aiRunFile(runDir, run.id),
    session: sessionName(opts.feature),
    baseURL: run.baseURL,
    viewport: run.viewport,
    authFile: hasAuth ? path.relative(opts.root ?? process.cwd(), auth) : null,
    warnings,
  };
}
