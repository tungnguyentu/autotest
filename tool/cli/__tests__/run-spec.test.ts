import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readLast } from "../../core/playwright-runner.ts";
import { runSpec } from "../run-spec.ts";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "core", "__tests__", "fake-playwright.mjs");
const SECRET = "hunter22xx";

let root: string;
let run: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "run-spec-"));
  fs.mkdirSync(path.join(root, "features", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "features", "demo", ".env"), `USER_PASSWORD=${SECRET}\n`);
  fs.mkdirSync(path.join(root, "tests", "demo"), { recursive: true });
  for (const id of ["TC_ok", "TC_fail"]) fs.writeFileSync(path.join(root, "tests", "demo", `${id}.spec.ts`), "");
  run = path.join(root, "evidence", "2026-10-07_demo");
  fs.mkdirSync(run, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const go = (id: string, extra: object = {}) => {
  const lines: string[] = [];
  const result = runSpec({ feature: "demo", id, root, env: { ...process.env, FAKE_SECRET: SECRET }, command: FAKE, onLine: (l) => lines.push(l), ...extra });
  return { lines, result };
};

describe("run-spec", () => {
  it("chạy spec qua runner: log in ra đã che credential, kết quả vào playwright-last.json", async () => {
    const { lines, result } = go("TC_ok", { runDir: "evidence/2026-10-07_demo" });
    const r = await result;
    assert.equal(r.passed, true);
    assert.equal(r.spec, "tests/demo/TC_ok.spec.ts");
    assert.ok(lines.some((l) => l.includes("secret=<secret:USER_PASSWORD>")), lines.join("\n"));
    assert.ok(!lines.join("\n").includes(SECRET), "stdout cho AI không được chứa credential");
    assert.equal(readLast(run)?.tests[0]?.status, "passed");
  });

  it("spec fail: passed=false, thông báo lỗi trong kết quả đã che", async () => {
    const r = await go("TC_fail").result; // không --run-dir: lấy đợt mới nhất
    assert.equal(r.passed, false);
    assert.equal(r.runDir, run);
    assert.ok(!fs.readFileSync(path.join(run, "playwright-results.json"), "utf8").includes(SECRET));
  });

  it("từ chối id sai, spec không có, đợt ngoài evidence, chưa có đợt", async () => {
    await assert.rejects(go("../x").result, /--id không hợp lệ/);
    await assert.rejects(go("TC_none").result, /Không tìm thấy tests\/demo\/TC_none\.spec\.ts/);
    await assert.rejects(go("TC_ok", { runDir: "features/demo" }).result, /--run-dir/);
    fs.rmSync(run, { recursive: true });
    await assert.rejects(go("TC_ok").result, /Chưa có đợt nào/);
  });
});
