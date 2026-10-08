import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { aiRunFile, appendStep, createAiRun, lockTiming, readAiRun, resolveEvidencePath, setAiResult, setTesterDecision } from "../ai-run-store.ts";

let root: string;
let runDir: string;
const opts = () => ({ root, env: {} as NodeJS.ProcessEnv });
const base = { id: "TC_1", feature: "demo", baseURL: "https://demo.example.com", viewport: { width: 10, height: 10 }, started_at: "2026-10-07T10:00:00+07:00" };
const step = (n: number) => ({ n, action: "navigate" as const, target: null, value: "/", url_before: null, url_after: null, screenshot: null, note: "" });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-run-store-"));
  runDir = path.join(root, "evidence", "2026-10-07_demo");
  fs.mkdirSync(runDir, { recursive: true });
});
afterEach(() => {
  lockTiming.waitMs = 3000;
  lockTiming.staleMs = 30_000;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ai-run-store khóa ghi", () => {
  it("mỗi lần ghi để lại file hợp lệ và không để lại file khóa", () => {
    createAiRun(runDir, base as never);
    appendStep(runDir, "TC_1", step(1));
    setAiResult(runDir, "TC_1", { verdict: "ĐẠT", per_expected: [] });
    setTesterDecision(runDir, "TC_1", { decision: "confirmed", note: "", decided_at: "2026-10-07T11:00:00+07:00" });
    const run = readAiRun(runDir, "TC_1");
    assert.equal(run.steps.length, 1);
    assert.equal(run.ai_result?.verdict, "ĐẠT");
    assert.equal(run.tester.decision, "confirmed");
    assert.deepEqual(fs.readdirSync(path.dirname(aiRunFile(runDir, "TC_1"))), ["TC_1.json"]);
  });

  it("đang có tiến trình khác giữ khóa thì báo lỗi rõ thay vì ghi đè, và không đụng file", () => {
    createAiRun(runDir, base as never);
    lockTiming.waitMs = 120;
    const lock = `${aiRunFile(runDir, "TC_1")}.lock`;
    fs.writeFileSync(lock, "");
    assert.throws(() => appendStep(runDir, "TC_1", step(1)), /đang được tiến trình khác ghi/);
    assert.equal(readAiRun(runDir, "TC_1").steps.length, 0);
    assert.ok(fs.existsSync(lock), "khóa của tiến trình khác không bị xóa");
  });

  it("khóa của tiến trình đã chết (quá cũ) bị gỡ", () => {
    createAiRun(runDir, base as never);
    const lock = `${aiRunFile(runDir, "TC_1")}.lock`;
    fs.writeFileSync(lock, "");
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(lock, old, old);
    appendStep(runDir, "TC_1", step(1));
    assert.equal(readAiRun(runDir, "TC_1").steps.length, 1);
    assert.ok(!fs.existsSync(lock));
  });

  it("step làm trên số cũ bị từ chối, không mất step đã ghi", () => {
    createAiRun(runDir, base as never);
    appendStep(runDir, "TC_1", step(1));
    assert.throws(() => appendStep(runDir, "TC_1", step(1)), /không khớp/);
    assert.equal(readAiRun(runDir, "TC_1").steps.length, 1);
  });
});

describe("resolveEvidencePath", () => {
  it("chỉ nhận đường dẫn trong evidence root, dùng được cho --out và --dir", () => {
    const ok = resolveEvidencePath("evidence/2026-10-07_demo/ui-diff", "--out", opts());
    assert.equal(ok, path.join(root, "evidence", "2026-10-07_demo", "ui-diff"));
    for (const bad of ["/etc", "..", "features/demo", "auth", "evidence/../features", "evidence"]) {
      assert.throws(() => resolveEvidencePath(bad, "--out", opts()), /--out/, bad);
    }
  });
});
