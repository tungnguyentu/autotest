import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { Router } from "express";
import { readFeature } from "../core/feature-store.ts";
import { authDir, authFlagFile, authMetaFile, publicUrl, PROJECT_ROOT } from "../core/paths.ts";
import { signalGroup, trackGroup } from "../core/process-group.ts";
import { featureParam, HttpError, type ToolContext } from "./http.ts";

export interface SessionMeta {
  saved_at: string;
  final_url: string;
}

/**
 * Trạng thái phiên chỉ lấy từ auth/<f>.meta.json. Không bao giờ đọc auth/<f>.json
 * (chứa cookie và token).
 */
export function readSession(feature: string, ctx: ToolContext): SessionMeta | null {
  try {
    const m = JSON.parse(fs.readFileSync(authMetaFile(feature, ctx), "utf8")) as Record<string, unknown>;
    if (typeof m.saved_at !== "string") return null;
    // Meta cũ có thể còn query hoặc fragment (token): luôn bỏ khi trả ra.
    return { saved_at: m.saved_at, final_url: typeof m.final_url === "string" ? publicUrl(m.final_url) : "" };
  } catch {
    return null;
  }
}

/** Tạo tiến trình `login` tách rời. Tiến trình phải tự thoát khi thấy file cờ. */
export type LoginSpawner = (feature: string, ctx: ToolContext) => ChildProcess;

export const spawnLoginCli: LoginSpawner = (feature) =>
  spawn("npm", ["run", "cli", "--", "login", "--feature", feature, "--wait-flag"], {
    cwd: PROJECT_ROOT,
    detached: true, // nhóm tiến trình riêng để dừng được cả npm, tsx và Chromium
    stdio: ["ignore", "pipe", "pipe"],
  });

const LOG_LINES = 200;

interface LoginState {
  child: ChildProcess;
  pid: number | undefined;
  running: boolean;
  exitCode: number | null;
  log: string[];
}

export interface AuthRouter {
  router: Router;
  /** Dừng mọi tiến trình login do server này mở. Gọi khi tắt server. */
  stopAll: () => void;
}

export function authRouter(ctx: ToolContext, spawnLogin: LoginSpawner = spawnLoginCli): AuthRouter {
  const router = Router({ mergeParams: true });
  const states = new Map<string, LoginState>();

  const pushLog = (st: LoginState, chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) if (line.trim()) st.log.push(line);
    if (st.log.length > LOG_LINES) st.log.splice(0, st.log.length - LOG_LINES);
  };

  const view = (feature: string) => {
    const st = states.get(feature);
    return {
      running: st?.running ?? false,
      pid: st?.running ? st.pid : undefined,
      exit_code: st && !st.running ? st.exitCode : null,
      log: st ? st.log.slice(-50) : [],
      session: readSession(feature, ctx),
    };
  };

  router.get("/", (req, res) => {
    res.json(view(featureParam(req)));
  });

  router.post("/start", (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx); // 404 nếu chưa có tính năng, 400 nếu feature.json sai
    if (states.get(feature)?.running) throw new HttpError(409, "Cửa sổ đăng nhập của tính năng này đang mở.");

    const child = spawnLogin(feature, ctx);
    trackGroup(child);
    const st: LoginState = { child, pid: child.pid, running: true, exitCode: null, log: [] };
    states.set(feature, st);
    child.stdout?.setEncoding("utf8").on("data", (c: string) => pushLog(st, c));
    child.stderr?.setEncoding("utf8").on("data", (c: string) => pushLog(st, c));
    child.on("error", (err) => {
      pushLog(st, `Không chạy được lệnh login: ${err.message}`);
      st.running = false;
      st.exitCode = 1;
    });
    child.on("close", (code) => {
      st.running = false;
      st.exitCode = code ?? 1;
    });
    res.status(202).json(view(feature));
  });

  router.post("/save", (req, res) => {
    const feature = featureParam(req);
    if (!states.get(feature)?.running) throw new HttpError(409, "Chưa mở cửa sổ đăng nhập. Bấm \"Mở browser để đăng nhập\" trước.");
    fs.mkdirSync(authDir(ctx), { recursive: true, mode: 0o700 });
    fs.writeFileSync(authFlagFile(feature, ctx), "");
    res.status(202).json(view(feature));
  });

  const stopAll = () => {
    for (const st of states.values()) if (st.running) signalGroup(st.child, "SIGTERM");
  };

  return { router, stopAll };
}
