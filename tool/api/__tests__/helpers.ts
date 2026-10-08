import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, type RunningServer } from "../../server.ts";
import type { LoginSpawner } from "../auth.ts";
import type { CaptureFn } from "../ui-diff.ts";

export interface TestEnv {
  root: string;
  server: RunningServer;
  url: string;
  call: (method: string, p: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any }>;
  cleanup: () => Promise<void>;
}

export const FEATURE = {
  feature: "demo",
  service: "Demo",
  baseURL: "https://demo.example.com",
  viewport: { width: 1280, height: 720 },
  screens: { home: { path: "/", auth: true, mask: [], scale: 1, wait_for: [] } },
};

export const CASE = {
  id: "TC_DEMO_001",
  title: "Đăng nhập đúng",
  preconditions: [],
  steps: ["Mở trang đăng nhập", "Nhập thông tin hợp lệ"],
  expected: ["Vào được trang chủ"],
  priority: "High",
  type: "positive",
  status: "draft",
};

/** Tiến trình giả lập `login --wait-flag`: thấy file cờ thì ghi meta, xóa cờ rồi thoát. */
export const fakeLogin: LoginSpawner = (feature, ctx) => {
  const script = `
    const fs = require("fs"), path = require("path");
    const [dir, f] = process.argv.slice(1);
    console.log("fake login mở");
    const t = setInterval(() => {
      const flag = path.join(dir, f + ".save");
      if (!fs.existsSync(flag)) return;
      fs.writeFileSync(path.join(dir, f + ".json"), JSON.stringify({ cookies: [{ name: "secret", value: "TOKEN-123" }] }));
      fs.writeFileSync(path.join(dir, f + ".meta.json"), JSON.stringify({ feature: f, saved_at: "2026-10-07T10:00:00+07:00", final_url: "https://demo.example.com/home" }));
      fs.rmSync(flag);
      clearInterval(t);
    }, 50);
  `;
  return spawn(process.execPath, ["-e", script, path.join(ctx.root, "auth"), feature], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
};

export async function setup(opts: { seedFeature?: boolean; env?: NodeJS.ProcessEnv; killGraceMs?: number; capture?: CaptureFn } = {}): Promise<TestEnv> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tool-api-"));
  fs.mkdirSync(path.join(root, "features"), { recursive: true });
  if (opts.seedFeature !== false) {
    fs.mkdirSync(path.join(root, "features", "demo"), { recursive: true });
    fs.writeFileSync(path.join(root, "features", "demo", "feature.json"), JSON.stringify(FEATURE));
  }
  const server = await startServer({ root, port: 0, env: opts.env ?? {}, spawnLogin: fakeLogin, debounceMs: 50, killGraceMs: opts.killGraceMs, capture: opts.capture });
  await server.watcherReady;
  const url = `http://127.0.0.1:${server.port}`;
  return {
    root,
    server,
    url,
    call: async (method, p, body, headers = {}) => {
      const res = await fetch(url + p, {
        method,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // không phải JSON
      }
      return { status: res.status, body: parsed };
    },
    cleanup: async () => {
      await server.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
