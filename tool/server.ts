import { execFileSync } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Response } from "express";
import { authRouter, type LoginSpawner } from "./api/auth.ts";
import { featuresRouter } from "./api/features.ts";
import { errorHandler, HttpError, type ToolContext } from "./api/http.ts";
import { aiRunsRouter } from "./api/ai-runs.ts";
import { healRouter } from "./api/heal.ts";
import { playwrightRouter, reportRouter } from "./api/playwright.ts";
import { runsRouter } from "./api/runs.ts";
import { createUiDiff, type CaptureFn, type UiDiffEvent } from "./api/ui-diff.ts";
import { testcasesRouter } from "./api/testcases.ts";
import { usecasesRouter } from "./api/usecases.ts";
import { PROJECT_ROOT } from "./core/paths.ts";
import { createPlaywrightRunner, type RunnerEvent } from "./core/playwright-runner.ts";
import { installProcessCleanup } from "./core/process-group.ts";
import { startWatcher, type ChangeEvent } from "./core/watcher.ts";

export const DEFAULT_PORT = 4173;
const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SSE_HEARTBEAT_MS = 25_000;

export interface ServerOptions {
  /** Gốc project. Mặc định là thư mục chứa package.json của tool. */
  root?: string;
  /** Cổng. 0 để hệ điều hành chọn (dùng trong test). */
  port?: number;
  env?: NodeJS.ProcessEnv;
  /** Thay lệnh mở cửa sổ đăng nhập (test). */
  spawnLogin?: LoginSpawner;
  debounceMs?: number;
  /** Thời gian chờ giữa SIGTERM và SIGKILL khi dừng Playwright (mặc định 5 giây). */
  killGraceMs?: number;
  /** Thay bước chụp ảnh của "Chụp và so" (test, không mở trình duyệt). */
  capture?: CaptureFn;
}

export interface RunningServer {
  port: number;
  /** Watcher đã quét xong, sự kiện file đổi từ lúc này sẽ được phát. */
  watcherReady: Promise<void>;
  close: () => Promise<void>;
}

const hostnameOf = (hostHeader: string | undefined): string => {
  if (!hostHeader) return "";
  return hostHeader.startsWith("[") ? hostHeader.slice(0, hostHeader.indexOf("]") + 1) : hostHeader.split(":")[0]!;
};

export function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const ctx: ToolContext = { root: options.root ?? PROJECT_ROOT, env: options.env ?? process.env };
  const app = express();
  app.disable("x-powered-by");

  // Server mở API ghi file và spawn tiến trình: chỉ nhận request từ chính máy này (chặn DNS rebinding, trang web lạ).
  app.use((req, _res, next) => {
    if (!LOCAL_HOSTS.has(hostnameOf(req.headers.host))) return next(new HttpError(403, "Chỉ truy cập qua localhost."));
    const origin = req.headers.origin;
    if (origin && req.method !== "GET" && req.method !== "HEAD") {
      let ok = false;
      try {
        // Cùng máy và cùng cổng với server: dịch vụ khác trên localhost không gọi được API ghi.
        const u = new URL(origin);
        const port = u.port || (u.protocol === "https:" ? "443" : "80");
        ok = LOCAL_HOSTS.has(u.hostname) && port === String(req.socket.localPort);
      } catch {
        // origin không phải URL: từ chối
      }
      if (!ok) return next(new HttpError(403, "Nguồn yêu cầu không được phép."));
    }
    next();
  });

  // ---- SSE: báo file đổi, không gửi nội dung ----
  const clients = new Set<Response>();
  const send = (event: string, data: ChangeEvent | RunnerEvent | UiDiffEvent) => {
    for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const broadcast = (events: ChangeEvent[]) => events.forEach((e) => send("change", e));
  // PLAYWRIGHT_BIN thay `npx playwright` bằng một lệnh khác (test). Log và trạng thái chạy qua event `playwright`.
  const runner = createPlaywrightRunner({
    root: ctx.root,
    env: ctx.env,
    emit: (e) => send("playwright", e),
    command: ctx.env.PLAYWRIGHT_BIN || undefined,
    killGraceMs: options.killGraceMs,
  });
  const uiDiff = createUiDiff(ctx, runner, (e) => send("ui-diff", e), options.capture);
  app.get("/events", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    res.write(": connected\n\n");
    clients.add(res);
    const beat = setInterval(() => res.write(": ping\n\n"), SSE_HEARTBEAT_MS);
    req.on("close", () => {
      clearInterval(beat);
      clients.delete(res);
    });
  });

  // ---- API ----
  const auth = authRouter(ctx, options.spawnLogin);
  app.use("/api", express.json({ limit: "2mb" }));
  app.use("/api/features", featuresRouter(ctx));
  app.use("/api/features/:f/usecases", usecasesRouter(ctx));
  app.use("/api/features/:f/testcases", testcasesRouter(ctx));
  app.use("/api/features/:f/login", auth.router);
  app.use("/api/features/:f/runs", runsRouter(ctx));
  app.use("/api/features/:f/playwright", playwrightRouter(ctx, runner));
  app.use("/api/features/:f/ui-diff", uiDiff.featureRouter);
  app.use("/api/runs", aiRunsRouter(ctx));
  app.use("/api/runs", healRouter(ctx, runner));
  app.use("/api/runs", uiDiff.runRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Không có API này." });
  });

  app.use("/report", reportRouter(ctx));

  // ---- UI tĩnh. Chỉ phục vụ tool/ui, không bao giờ phục vụ project root ----
  app.use(express.static(UI_DIR, { dotfiles: "ignore", extensions: ["html"] }));
  app.use(errorHandler);

  const watcher = startWatcher(ctx, broadcast, options.debounceMs);

  return new Promise((resolve, reject) => {
    const server: Server = app.listen(options.port ?? DEFAULT_PORT, "127.0.0.1");
    server.once("error", (err) => {
      void watcher.close();
      reject(err);
    });
    server.once("listening", () => {
      const close = async () => {
        auth.stopAll();
        uiDiff.stop();
        await runner.stop();
        for (const c of clients) c.end();
        await watcher.close();
        await new Promise<void>((r) => {
          server.close(() => r());
          server.closeAllConnections();
        });
      };
      resolve({ port: (server.address() as AddressInfo).port, watcherReady: watcher.ready, close });
    });
  });
}

/** In tiến trình đang giữ cổng để tester biết dừng cái nào. */
function reportPortOwner(port: number): void {
  console.error(`[server] Cổng ${port} đang bận. Tiến trình đang giữ cổng:`);
  try {
    console.error(execFileSync("lsof", ["-nP", "-i", `:${port}`], { encoding: "utf8" }).trimEnd());
  } catch {
    console.error("(không xác định được tiến trình. Thử: lsof -i :" + port + ")");
  }
  console.error(`Tool không tự đổi cổng. Dừng tiến trình trên rồi chạy lại \`npm start\`.`);
}

export async function main(): Promise<void> {
  let running: RunningServer;
  try {
    running = await startServer({ port: DEFAULT_PORT });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      reportPortOwner(DEFAULT_PORT);
    } else {
      console.error(`[server] Không khởi động được: ${(err as Error).message}`);
    }
    process.exit(1);
  }
  console.log(`[server] Tool đang chạy: http://localhost:${running.port}`);
  console.log("[server] Bấm Ctrl+C để dừng.");
  // SIGINT, SIGTERM, SIGHUP (đóng terminal) và lỗi không bắt được đều dọn tiến trình con trước khi thoát.
  installProcessCleanup(() => running.close());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
