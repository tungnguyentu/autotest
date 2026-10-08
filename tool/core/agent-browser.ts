import { execFile } from "node:child_process";
import { assertFeatureName } from "./paths.ts";

export interface BrowserOptions {
  feature: string;
  env?: NodeJS.ProcessEnv;
  /** Che chuỗi trước khi đưa vào thông báo lỗi. */
  redactText?: (text: string) => string;
  timeoutMs?: number;
}

/** Tên session agent-browser của một tính năng. Mỗi tính năng một trình duyệt riêng. */
export function sessionName(feature: string): string {
  return `ui-check-${assertFeatureName(feature)}`;
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value) return String((value as { message: unknown }).message);
  return value === undefined || value === null ? "" : JSON.stringify(value);
}

/**
 * Gọi `agent-browser --session ui-check-<feature> --json <args>` qua execFile (không qua shell)
 * và trả về `data` của kết quả. Thông báo lỗi tự dựng từ JSON hoặc stderr, không dùng
 * `err.message` của Node vì nó chứa nguyên dòng lệnh, kể cả giá trị credential.
 */
export function runAgentBrowser(opts: BrowserOptions, args: string[]): Promise<Record<string, unknown>> {
  const env = opts.env ?? process.env;
  const bin = env.AGENT_BROWSER_BIN?.trim() || "agent-browser";
  const safe = opts.redactText ?? ((t: string) => t);
  const argv = ["--session", sessionName(opts.feature), "--json", ...args];

  return new Promise((resolve, reject) => {
    execFile(
      bin,
      argv,
      { env: { ...process.env, ...env }, timeout: opts.timeoutMs ?? 60_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const label = `agent-browser ${args[0] ?? ""}`.trim();
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error(`Không tìm thấy lệnh "${bin}". Cài agent-browser hoặc đặt AGENT_BROWSER_BIN.`));
          return;
        }
        let parsed: { success?: boolean; data?: Record<string, unknown> | null; error?: unknown } | undefined;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          parsed = undefined;
        }
        if (parsed?.success === true) {
          resolve(parsed.data ?? {});
          return;
        }
        const detail = parsed ? errorText(parsed.error) : "";
        const fallback = err ? (err.killed ? "quá thời gian chờ" : stderr.trim() || `mã thoát ${err.code}`) : "kết quả không phải JSON";
        reject(new Error(safe(`${label} lỗi: ${detail || fallback}`)));
      },
    );
  });
}
