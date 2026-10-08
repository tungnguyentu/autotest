import fs from "node:fs";
import { runAgentBrowser } from "../core/agent-browser.ts";
import { findRunDirOfAiRun, readAiRun, setAiResult } from "../core/ai-run-store.ts";
import { PROJECT_ROOT, resolveUserPath, type PathOptions } from "../core/paths.ts";
import { loadSecrets, redact } from "../core/redact.ts";
import { parseAiResult, type AiRun } from "../core/schemas.ts";

export interface RunFinishOptions extends PathOptions {
  feature: string;
  id: string;
  /** File JSON `ai_result`: {verdict, per_expected[]}. */
  resultFile: string;
  runDir?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunFinishResult {
  runDir: string;
  run: AiRun;
  warnings: string[];
}

/**
 * Ghi ai_result vào ai-run/<id>.json và đóng session agent-browser.
 * Không đổi status test case và không ghi quyết định tester.
 */
export async function runFinish(opts: RunFinishOptions): Promise<RunFinishResult> {
  const runDir = findRunDirOfAiRun(opts.feature, opts.id, opts.runDir, opts);
  // Chỉ đọc file trong project hoặc thư mục đợt, và không bao giờ đọc .env hay auth/.
  const resultFile = resolveUserPath(opts.resultFile, "--result-file", [opts.root ?? PROJECT_ROOT, runDir], opts);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(resultFile, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Không tìm thấy --result-file: ${opts.resultFile}`);
    // Thông báo lỗi parse của Node trích đầu file, nên không chuyển tiếp.
    throw new Error(`--result-file không đọc được hoặc không phải JSON hợp lệ: ${opts.resultFile}`);
  }
  const result = redact(parseAiResult(raw), loadSecrets(opts.feature, opts));

  if (readAiRun(runDir, opts.id).tester.decision) throw new Error(`Tester đã quyết định về ${opts.id}, không ghi đè kết quả AI.`);
  const run = setAiResult(runDir, opts.id, result);

  const warnings: string[] = [];
  try {
    await runAgentBrowser({ feature: opts.feature, env: opts.env, timeoutMs: 15_000 }, ["close"]);
  } catch (err) {
    warnings.push(`Đã ghi kết quả nhưng không đóng được session agent-browser: ${(err as Error).message}`);
  }
  return { runDir, run, warnings };
}
