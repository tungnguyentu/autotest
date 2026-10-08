import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic, writeTextAtomic } from "./feature-store.ts";
import { localIso } from "./paths.ts";
import { signalGroup, trackGroup } from "./process-group.ts";
import { redact, redactText, loadSecrets, type Secrets } from "./redact.ts";
import { parsePlaywrightLast, type PlaywrightLast, type PlaywrightTestResult } from "./schemas.ts";

export const KILL_GRACE_MS = 5000;

export type RunnerEvent =
  | { type: "playwright-log"; feature: string; run: string; line: string }
  | { type: "playwright-state"; state: "running" | "finished"; feature: string; run: string; spec: string | null };

export interface RunnerOptions {
  root: string;
  env: NodeJS.ProcessEnv;
  emit: (event: RunnerEvent) => void;
  /** Lệnh thay cho `npx playwright` (test). Được gọi là `<command> test [spec]`. */
  command?: string;
  killGraceMs?: number;
}

export interface StartRequest {
  feature: string;
  runDir: string;
  /** Đường dẫn spec tương đối với gốc project. Bỏ trống để chạy cả thư mục. */
  spec?: string;
  /** Tham số thêm cho `playwright test`, ví dụ `--update-snapshots`. */
  extraArgs?: string[];
  /** Gọi sau khi `playwright-last.json` đã ghi và tiến trình đã được giải phóng. `last` là null nếu file không ghi được. */
  onFinish?: (last: PlaywrightLast | null) => void;
}

export interface RunningInfo {
  feature: string;
  run: string;
  spec: string | null;
  started_at: string;
}

export class RunnerBusyError extends Error {}

export const lastFile = (runDir: string) => path.join(runDir, "playwright-last.json");
export const logFile = (runDir: string) => path.join(runDir, "playwright-log.txt");
export const resultsFile = (runDir: string) => path.join(runDir, "playwright-results.json");

// eslint-disable-next-line no-control-regex -- bỏ mã màu ANSI khỏi log
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

interface JsonSpec {
  file?: string;
  title?: string;
  tests?: { status?: string; results?: { duration?: number }[] }[];
}
interface JsonSuite {
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}

const STATUS_MAP: Record<string, PlaywrightTestResult["status"]> = {
  expected: "passed",
  unexpected: "failed",
  flaky: "flaky",
  skipped: "skipped",
};

/** Làm phẳng reporter JSON của Playwright thành danh sách test. File thiếu hoặc hỏng thì trả mảng rỗng. */
export function readPlaywrightResults(file: string): PlaywrightTestResult[] {
  let report: { suites?: JsonSuite[] };
  try {
    report = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  const out: PlaywrightTestResult[] = [];
  const walk = (suite: JsonSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        out.push({
          file: path.basename(String(spec.file ?? "")),
          title: String(spec.title ?? ""),
          status: STATUS_MAP[String(t.status)] ?? "failed",
          duration_ms: (t.results ?? []).reduce((sum, r) => sum + (r.duration ?? 0), 0),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return out;
}

/**
 * Che giá trị credential trong `playwright-results.json` (thông báo lỗi có thể in giá trị đã nhập) ngay sau lần chạy,
 * để skill và UI chỉ thấy bản đã che. File không phải JSON thì che theo văn bản thô. Không có file thì bỏ qua.
 */
export function redactResultsFile(file: string, secrets: Secrets): void {
  if (!Object.keys(secrets).length) return;
  try {
    const raw = fs.readFileSync(file, "utf8");
    let out = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      const masked = redact(parsed, secrets);
      if (JSON.stringify(masked) !== JSON.stringify(parsed)) out = JSON.stringify(masked);
    } catch {
      out = redactText(raw, secrets);
    }
    if (out !== raw) writeTextAtomic(file, out);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.error(`[playwright] Không che được ${file}: ${(err as Error).message}`);
  }
}

export function readLast(runDir: string): PlaywrightLast | null {
  try {
    return parsePlaywrightLast(JSON.parse(fs.readFileSync(lastFile(runDir), "utf8")));
  } catch {
    return null;
  }
}

/** Một tiến trình `playwright test` mỗi lúc. Log vào `<đợt>/playwright-log.txt` và qua `emit`. */
export function createPlaywrightRunner(options: RunnerOptions) {
  const grace = options.killGraceMs ?? KILL_GRACE_MS;
  let current: { info: RunningInfo; child: ChildProcess; stopped: boolean; done: Promise<void> } | null = null;

  function start(req: StartRequest): RunningInfo {
    if (current) {
      throw new RunnerBusyError(
        `Playwright đang chạy (${current.info.feature}, ${current.info.spec ?? "toàn bộ spec"}). Chờ xong hoặc bấm Dừng.`,
      );
    }
    const run = path.basename(req.runDir);
    const started = new Date();
    const info: RunningInfo = { feature: req.feature, run, spec: req.spec ?? null, started_at: localIso(started) };

    fs.mkdirSync(req.runDir, { recursive: true });
    // File kết quả của lần chạy trước không được lọt vào lần này.
    fs.rmSync(resultsFile(req.runDir), { force: true });
    const log = fs.createWriteStream(logFile(req.runDir), { flags: "w" });
    let secrets: Secrets = {};
    try {
      secrets = loadSecrets(req.feature, { root: options.root });
    } catch {
      // .env không đọc được: log vẫn ghi, chỉ không che được
    }

    const args = options.command
      ? ["test"]
      : ["playwright", "test"];
    if (req.spec) args.push(req.spec);
    args.push(...(req.extraArgs ?? []));
    const child = spawn(options.command ?? "npx", args, {
      cwd: options.root,
      // Nhóm tiến trình riêng để dừng được cả npx lẫn trình duyệt do nó mở.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...options.env, FEATURE: req.feature, EVIDENCE_DIR: req.runDir, FORCE_COLOR: "0" },
    });

    const pushLine = (raw: string) => {
      const line = redactText(raw.replace(ANSI, ""), secrets);
      log.write(line + "\n");
      options.emit({ type: "playwright-log", feature: req.feature, run, line });
    };
    const feed = (stream: NodeJS.ReadableStream | null) => {
      let buf = "";
      stream?.setEncoding("utf8");
      stream?.on("data", (chunk: string) => {
        buf += chunk;
        const parts = buf.split(/\r?\n/);
        buf = parts.pop() ?? "";
        parts.forEach(pushLine);
      });
      stream?.on("end", () => {
        if (buf) pushLine(buf);
        buf = "";
      });
    };
    trackGroup(child);
    feed(child.stdout);
    feed(child.stderr);

    const entry = { info, child, stopped: false, done: Promise.resolve() };
    current = entry;
    options.emit({ type: "playwright-state", state: "running", feature: req.feature, run, spec: info.spec });

    entry.done = new Promise<void>((resolve) => {
      let settled = false;
      const finish = (exitCode: number | null, spawnError?: string) => {
        if (settled) return;
        settled = true;
        if (spawnError) log.write(`Không chạy được Playwright: ${spawnError}\n`);
        log.end(() => {
          redactResultsFile(resultsFile(req.runDir), secrets);
          try {
            writeJsonAtomic(
              lastFile(req.runDir),
              parsePlaywrightLast({
                feature: req.feature,
                spec: info.spec,
                exit_code: exitCode,
                stopped: entry.stopped,
                started_at: info.started_at,
                finished_at: localIso(),
                tests: readPlaywrightResults(resultsFile(req.runDir)),
              }),
            );
          } catch (err) {
            console.error(`[playwright] Không ghi được playwright-last.json: ${(err as Error).message}`);
          }
          current = null;
          options.emit({ type: "playwright-state", state: "finished", feature: req.feature, run, spec: info.spec });
          try {
            req.onFinish?.(readLast(req.runDir));
          } catch (err) {
            console.error(`[playwright] onFinish lỗi: ${(err as Error).message}`);
          }
          resolve();
        });
      };
      child.once("error", (err) => finish(null, err.message));
      // `close` đến sau khi stdout và stderr đã đọc hết.
      child.once("close", (code) => finish(code));
    });
    return info;
  }

  /** SIGTERM, rồi SIGKILL nếu sau `killGraceMs` vẫn chưa thoát. Trả về khi `playwright-last.json` đã ghi. */
  async function stop(): Promise<boolean> {
    const entry = current;
    if (!entry) return false;
    entry.stopped = true;
    signalGroup(entry.child, "SIGTERM");
    const timer = setTimeout(() => signalGroup(entry.child, "SIGKILL"), grace);
    try {
      await entry.done;
    } finally {
      clearTimeout(timer);
    }
    return true;
  }

  return {
    start,
    stop,
    running: (): RunningInfo | null => (current ? { ...current.info } : null),
  };
}

export type PlaywrightRunner = ReturnType<typeof createPlaywrightRunner>;
