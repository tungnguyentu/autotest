import fs from "node:fs";
import path from "node:path";
import { listRunDirs, resolveRunDirOption } from "../core/ai-run-store.ts";
import { assertFeatureName, PROJECT_ROOT, testsDir, type PathOptions } from "../core/paths.ts";
import { createPlaywrightRunner, type PlaywrightRunner } from "../core/playwright-runner.ts";
import type { PlaywrightLast } from "../core/schemas.ts";

const ID = /^[A-Za-z0-9_-]+$/;

export interface RunSpecOptions extends PathOptions {
  feature: string;
  id: string;
  /** Thư mục đợt. Bỏ trống thì dùng đợt mới nhất của tính năng. */
  runDir?: string;
  env?: NodeJS.ProcessEnv;
  /** Nhận từng dòng log đã che credential. Mặc định in ra stdout. */
  onLine?: (line: string) => void;
  /** Lệnh thay `npx playwright` (test). */
  command?: string;
  /** Nhận runner ngay khi tạo, để CLI dừng được khi bị ngắt. */
  onRunner?: (runner: PlaywrightRunner) => void;
}

export interface RunSpecResult {
  runDir: string;
  spec: string;
  last: PlaywrightLast | null;
  passed: boolean;
}

/**
 * Chạy `tests/<feature>/<id>.spec.ts` qua runner của tool: log che credential, `playwright-results.json` che
 * credential, kết quả vào `<đợt>/playwright-last.json`. Đây là đường duy nhất để AI chạy spec, vì chạy
 * `npx playwright test` trực tiếp đưa log chưa che vào ngữ cảnh của AI.
 */
export async function runSpec(opts: RunSpecOptions): Promise<RunSpecResult> {
  const feature = assertFeatureName(opts.feature);
  if (!ID.test(opts.id)) throw new Error(`--id không hợp lệ: "${opts.id}". Chỉ dùng chữ, số, "-" và "_".`);
  const root = opts.root ?? PROJECT_ROOT;
  const specRel = `tests/${feature}/${opts.id}.spec.ts`;
  if (!fs.existsSync(path.join(testsDir(feature, opts), `${opts.id}.spec.ts`))) throw new Error(`Không tìm thấy ${specRel}.`);

  let runDir: string;
  if (opts.runDir) runDir = resolveRunDirOption(opts.runDir, opts);
  else {
    const latest = listRunDirs(feature, opts)[0];
    if (!latest) throw new Error(`Chưa có đợt nào của ${feature}. Chạy \`npm run cli -- evidence-dir --feature ${feature}\` trước hoặc truyền --run-dir.`);
    runDir = latest;
  }

  const env = opts.env ?? process.env;
  const print = opts.onLine ?? ((line: string) => console.log(line));
  const runner = createPlaywrightRunner({
    root,
    env,
    emit: (e) => {
      if (e.type === "playwright-log") print(e.line);
    },
    command: opts.command ?? (env.PLAYWRIGHT_BIN || undefined),
  });
  opts.onRunner?.(runner);
  const last = await new Promise<PlaywrightLast | null>((resolve) => {
    runner.start({ feature, runDir, spec: specRel, onFinish: resolve });
  });
  return { runDir, spec: specRel, last, passed: Boolean(last && last.exit_code === 0 && !last.stopped) };
}
