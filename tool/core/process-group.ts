import type { ChildProcess } from "node:child_process";

/**
 * Các tiến trình con chạy trong nhóm tiến trình riêng (Playwright, cửa sổ đăng nhập). Server tắt đột ngột
 * (SIGHUP khi đóng terminal, lỗi không bắt được) mà không dọn thì chúng mồ côi và giữ Chromium.
 */
const groups = new Set<ChildProcess>();

/** Theo dõi `child` đến khi nó thoát. */
export function trackGroup(child: ChildProcess): void {
  groups.add(child);
  child.once("exit", () => groups.delete(child));
  child.once("error", () => groups.delete(child));
}

/** Gửi `signal` tới nhóm tiến trình của `child`, hoặc riêng `child` nếu không có nhóm. Không ném lỗi. */
export function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (child.pid) process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // đã thoát
    }
  }
}

/** Gửi `signal` tới mọi nhóm đang theo dõi. Đồng bộ nên dùng được trong handler `exit`. */
export function killAllGroups(signal: NodeJS.Signals): void {
  for (const child of groups) signalGroup(child, signal);
}

export const trackedGroupCount = (): number => groups.size;

/**
 * Cài handler cho tiến trình chính (server hoặc CLI): tín hiệu dừng và lỗi không bắt được đều chạy `shutdown`
 * một lần; tín hiệu lần hai (hoặc `shutdown` quá `forceAfterMs`) giết cứng mọi nhóm rồi thoát. Handler `exit` là lớp cuối
 * khi tiến trình thoát mà không qua `shutdown`. Trả về hàm gỡ handler.
 */
export function installProcessCleanup(shutdown: () => Promise<void>, forceAfterMs = 15_000): () => void {
  let closing = false;
  const force = (code: number) => {
    killAllGroups("SIGKILL");
    process.exit(code);
  };
  const run = (code: number) => {
    if (closing) return force(code || 1);
    closing = true;
    setTimeout(() => force(code || 1), forceAfterMs).unref();
    void shutdown().then(
      () => process.exit(code),
      () => force(code || 1),
    );
  };
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const onSignal = () => run(0);
  const onFatal = (err: unknown) => {
    console.error("[tool] Lỗi không bắt được:", err);
    run(1);
  };
  const onExit = () => killAllGroups("SIGTERM");
  for (const s of signals) process.on(s, onSignal);
  process.on("uncaughtException", onFatal);
  process.on("unhandledRejection", onFatal);
  process.on("exit", onExit);
  return () => {
    for (const s of signals) process.off(s, onSignal);
    process.off("uncaughtException", onFatal);
    process.off("unhandledRejection", onFatal);
    process.off("exit", onExit);
  };
}
