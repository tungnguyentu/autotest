import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "process-group-fixture.ts");

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const until = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return cond();
};

async function launch() {
  const parent = spawn(process.execPath, ["--import", "tsx", FIXTURE], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = new Promise<number | null>((r) => parent.once("exit", (code) => r(code)));
  let out = "";
  parent.stdout.on("data", (c) => (out += c));
  assert.ok(await until(() => /pid \d+/.test(out)), "fixture không khởi động");
  const childPid = Number(/pid (\d+)/.exec(out)![1]);
  assert.ok(alive(childPid));
  return { parent, childPid, exited };
}

describe("dọn tiến trình con khi tiến trình chính bị tắt", () => {
  for (const signal of ["SIGHUP", "SIGTERM", "SIGINT"] as const) {
    it(`${signal}: tiến trình con trong nhóm riêng bị dừng, không mồ côi`, async () => {
      const { parent, childPid, exited } = await launch();
      try {
        parent.kill(signal);
        await exited;
        assert.ok(await until(() => !alive(childPid)), `tiến trình con ${childPid} còn sống sau ${signal}`);
      } finally {
        if (alive(childPid)) process.kill(childPid, "SIGKILL");
        parent.kill("SIGKILL");
      }
    });
  }
});
