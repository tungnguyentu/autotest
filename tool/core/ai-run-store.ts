import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "./feature-store.ts";
import { assertFeatureName, evidenceRoot, localDate, resolveUserPath, type PathOptions } from "./paths.ts";
import { parseAiRun, type AiRun, type AiRunStep } from "./schemas.ts";

type StoreOptions = PathOptions & { env?: NodeJS.ProcessEnv };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pad2 = (n: number) => String(n).padStart(2, "0");

export const aiRunFile = (runDir: string, id: string) => path.join(runDir, "ai-run", `${id}.json`);

/** Đường dẫn ảnh của step, tương đối với thư mục đợt. */
export const screenshotRelPath = (id: string, n: number) => `screenshots/${id}/${pad2(n)}.png`;

/** Các đợt của tính năng trong evidence root, mới nhất trước. */
export function listRunDirs(feature: string, opts?: StoreOptions): string[] {
  const base = evidenceRoot(opts);
  if (!fs.existsSync(base)) return [];
  const re = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})_${escapeRe(assertFeatureName(feature))}(?:_r(\\d+))?$`);
  const found: { name: string; date: string; round: number }[] = [];
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    const m = e.isDirectory() ? re.exec(e.name) : null;
    if (m) found.push({ name: e.name, date: m[1]!, round: m[2] ? Number(m[2]) : 1 });
  }
  found.sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round);
  return found.map((f) => path.join(base, f.name));
}

/** Đợt mới nhất của tính năng trong ngày `date`, hoặc undefined. */
export function latestRunDirOfDay(feature: string, date: string = localDate(), opts?: StoreOptions): string | undefined {
  return listRunDirs(feature, opts).find((d) => path.basename(d).startsWith(`${date}_`));
}

/**
 * Đường dẫn do người dùng hoặc AI đưa vào (`--run-dir`, `--out`, `--dir`): tương đối tính từ gốc project,
 * phải nằm trong evidence root (kể cả khi đi qua symlink) và không phải đường dẫn nhạy cảm.
 */
export function resolveEvidencePath(input: string, label: string, opts?: StoreOptions): string {
  const base = evidenceRoot(opts);
  return resolveUserPath(input, label, [base], { ...opts, where: `thư mục evidence (${base})` });
}

/** Chuẩn hóa --run-dir. */
export function resolveRunDirOption(runDir: string, opts?: StoreOptions): string {
  return resolveEvidencePath(runDir, "--run-dir", opts);
}

/** Đợt chứa ai-run/<id>.json: --run-dir nếu có, ngược lại đợt mới nhất có file đó. */
export function findRunDirOfAiRun(feature: string, id: string, runDirOption: string | undefined, opts?: StoreOptions): string {
  if (runDirOption) {
    const dir = resolveRunDirOption(runDirOption, opts);
    if (!fs.existsSync(aiRunFile(dir, id))) throw new Error(`Chưa có ${aiRunFile(dir, id)}. Chạy run-start trước.`);
    return dir;
  }
  const dir = listRunDirs(feature, opts).find((d) => fs.existsSync(aiRunFile(d, id)));
  if (!dir) throw new Error(`Không thấy ai-run/${id}.json trong đợt nào của ${feature}. Chạy run-start trước.`);
  return dir;
}

export function readAiRun(runDir: string, id: string): AiRun {
  const file = aiRunFile(runDir, id);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Không tìm thấy ${file}`);
    throw err;
  }
  return parseAiRun(JSON.parse(raw));
}

function writeAiRun(runDir: string, run: AiRun): void {
  writeJsonAtomic(aiRunFile(runDir, run.id), parseAiRun(run));
}

/** Thời gian chờ khóa và tuổi khóa bị coi là của tiến trình đã chết (đổi được trong test). */
export const lockTiming = { waitMs: 3000, staleMs: 30_000 };
const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Khóa file `ai-run/<id>.json.lock` (tạo bằng cờ `wx`) quanh một lần đọc-sửa-ghi. Nhiều lệnh CLI có thể chạy song song
 * khác nhau cùng ghi một file, nên khóa phải nằm trên đĩa. Chờ tối đa `lockTiming.waitMs`; khóa cũ hơn `lockTiming.staleMs`
 * (tiến trình giữ khóa đã chết) bị gỡ.
 */
function withAiRunLock<T>(runDir: string, id: string, fn: () => T): T {
  const lock = `${aiRunFile(runDir, id)}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + lockTiming.waitMs;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, "wx"));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > lockTiming.staleMs) fs.rmSync(lock, { force: true });
      } catch {
        // khóa vừa được nhả
      }
      if (Date.now() > deadline) throw new Error(`ai-run/${id}.json đang được tiến trình khác ghi (${lock}). Thử lại sau vài giây.`);
      sleepSync(15);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

/** Tạo ai-run/<id>.json với steps rỗng. Không ghi đè file có sẵn. */
export function createAiRun(runDir: string, run: Omit<AiRun, "steps" | "ai_result" | "tester">): AiRun {
  const file = aiRunFile(runDir, run.id);
  return withAiRunLock(runDir, run.id, () => {
    if (fs.existsSync(file)) throw new Error(`Đã có ${file}. Không ghi đè evidence cũ.`);
    const created = parseAiRun({ ...run, steps: [], ai_result: null });
    writeAiRun(runDir, created);
    return created;
  });
}

export function nextStepNumber(runDir: string, id: string): number {
  return readAiRun(runDir, id).steps.length + 1;
}

/**
 * Thêm step. Đọc, kiểm tra số step và ghi nằm trong một khóa file, nên hai tiến trình không thêm cùng lúc.
 * `step.n` phải đúng số kế tiếp: step làm trên số cũ (đọc trước khi tiến trình khác ghi) bị từ chối thay vì mất âm thầm.
 */
export function appendStep(runDir: string, id: string, step: AiRunStep): AiRunStep {
  return withAiRunLock(runDir, id, () => {
    const run = readAiRun(runDir, id);
    const expected = run.steps.length + 1;
    if (step.n !== expected) throw new Error(`Số step ${step.n} không khớp số kế tiếp (${expected}) của ${id}.`);
    writeAiRun(runDir, { ...run, steps: [...run.steps, step] });
    return step;
  });
}

export function setAiResult(runDir: string, id: string, result: AiRun["ai_result"]): AiRun {
  return withAiRunLock(runDir, id, () => {
    const run = { ...readAiRun(runDir, id), ai_result: result };
    writeAiRun(runDir, run);
    return run;
  });
}

/** Ghi quyết định của tester vào `tester`. Đọc lại file trong khóa, nên không đè steps và ai_result do CLI vừa ghi. */
export function setTesterDecision(runDir: string, id: string, tester: AiRun["tester"]): AiRun {
  return withAiRunLock(runDir, id, () => {
    const run = { ...readAiRun(runDir, id), tester };
    writeAiRun(runDir, run);
    return run;
  });
}
