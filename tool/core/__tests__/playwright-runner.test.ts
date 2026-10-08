import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createPlaywrightRunner, lastFile, logFile, readLast, RunnerBusyError, type RunnerEvent } from "../playwright-runner.ts";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-playwright.mjs");

let root: string;
let runDir: string;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pw-runner-"));
  fs.mkdirSync(path.join(root, "features", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "features", "demo", ".env"), "USER_PASSWORD=hunter22xx\n");
  runDir = path.join(root, "evidence", "2026-10-07_demo");
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

function makeRunner(killGraceMs = 5000) {
  const events: RunnerEvent[] = [];
  const runner = createPlaywrightRunner({
    root,
    env: { ...process.env, FAKE_SECRET: "hunter22xx" },
    emit: (e) => events.push(e),
    command: FAKE,
    killGraceMs,
  });
  return { runner, events };
}

const waitFor = async (cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail("hết thời gian chờ");
};

describe("playwright runner", () => {
  it("chạy spec: log, SSE, playwright-last.json với kết quả từng test, che credential", async () => {
    const { runner, events } = makeRunner();
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_1.spec.ts" });
    await waitFor(() => runner.running() === null);

    const last = readLast(runDir);
    assert.ok(last);
    assert.equal(last.spec, "tests/demo/TC_1.spec.ts");
    assert.equal(last.exit_code, 0);
    assert.equal(last.stopped, false);
    assert.match(last.started_at, /[+-]\d\d:\d\d$/);
    assert.deepEqual(last.tests, [{ file: "TC_1.spec.ts", title: "TC_1.spec.ts - test", status: "passed", duration_ms: 20 }]);

    const log = fs.readFileSync(logFile(runDir), "utf8");
    assert.match(log, /fake playwright test tests\/demo\/TC_1\.spec\.ts feature=demo/);
    assert.match(log, /dòng stderr/);
    assert.ok(!log.includes("hunter22xx"), "log không được chứa credential");
    assert.match(log, /secret=<secret:USER_PASSWORD>/);

    const lines = events.filter((e) => e.type === "playwright-log").map((e) => (e as { line: string }).line);
    assert.ok(lines.some((l) => l.includes("fake playwright")));
    assert.ok(!lines.join("\n").includes("hunter22xx"));
    assert.deepEqual(events.filter((e) => e.type === "playwright-state").map((e) => (e as { state: string }).state), ["running", "finished"]);
  });

  it("test fail: exit_code 1 và status failed", async () => {
    const { runner } = makeRunner();
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_fail.spec.ts" });
    await waitFor(() => runner.running() === null);
    const last = readLast(runDir)!;
    assert.equal(last.exit_code, 1);
    assert.equal(last.tests[0]!.status, "failed");
  });

  it("playwright-results.json được che credential ngay sau lần chạy, vẫn là JSON hợp lệ", async () => {
    const { runner } = makeRunner();
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_fail.spec.ts" });
    await waitFor(() => runner.running() === null);
    const raw = fs.readFileSync(path.join(runDir, "playwright-results.json"), "utf8");
    assert.ok(!raw.includes("hunter22xx"), "kết quả Playwright không được chứa credential");
    const msg = JSON.parse(raw).suites[0].specs[0].tests[0].results[0].error.message;
    assert.equal(msg, 'Expected: "<secret:USER_PASSWORD>"');
    assert.equal(readLast(runDir)!.tests[0]!.status, "failed");
  });

  it("không chạy song song, báo lỗi rõ", async () => {
    const { runner } = makeRunner();
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_slow.spec.ts" });
    assert.throws(() => runner.start({ feature: "demo", runDir }), RunnerBusyError);
    assert.equal(runner.running()?.spec, "tests/demo/TC_slow.spec.ts");
    assert.equal(await runner.stop(), true);
    assert.equal(runner.running(), null);
    assert.equal(await runner.stop(), false);
  });

  it("dừng bằng SIGTERM: ghi playwright-last.json với stopped và không có exit_code", async () => {
    const { runner, events } = makeRunner();
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_slow.spec.ts" });
    await waitFor(() => events.some((e) => e.type === "playwright-log" && e.line === "đang chạy"));
    await runner.stop();
    const last = readLast(runDir)!;
    assert.equal(last.stopped, true);
    assert.equal(last.exit_code, null);
    assert.deepEqual(last.tests, []);
    // Sau khi dừng chạy lại được.
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_2.spec.ts" });
    await waitFor(() => runner.running() === null);
    assert.equal(readLast(runDir)!.exit_code, 0);
  });

  it("tiến trình bỏ qua SIGTERM bị SIGKILL sau thời gian chờ", async () => {
    const { runner, events } = makeRunner(300);
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_stubborn.spec.ts" });
    await waitFor(() => events.some((e) => e.type === "playwright-log" && e.line === "đang chạy"));
    const t0 = Date.now();
    await runner.stop();
    assert.ok(Date.now() - t0 >= 250, "phải chờ hết thời gian ân hạn");
    assert.equal(runner.running(), null);
    assert.equal(readLast(runDir)!.stopped, true);
  });

  it("kết quả của lần chạy trước không lọt vào lần sau", async () => {
    const { runner } = makeRunner();
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_3.spec.ts" });
    await waitFor(() => runner.running() === null);
    assert.equal(readLast(runDir)!.tests[0]!.file, "TC_3.spec.ts");
    runner.start({ feature: "demo", runDir, spec: "tests/demo/TC_slow.spec.ts" });
    await runner.stop();
    assert.deepEqual(readLast(runDir)!.tests, []);
    assert.ok(fs.existsSync(lastFile(runDir)));
  });

  it("lệnh không tồn tại: ghi playwright-last.json thay vì treo", async () => {
    const runner = createPlaywrightRunner({ root, env: process.env, emit: () => {}, command: path.join(root, "khong-co") });
    runner.start({ feature: "demo", runDir });
    await waitFor(() => runner.running() === null);
    const last = readLast(runDir)!;
    assert.equal(last.exit_code, null);
    assert.match(fs.readFileSync(logFile(runDir), "utf8"), /Không chạy được Playwright/);
  });
});
