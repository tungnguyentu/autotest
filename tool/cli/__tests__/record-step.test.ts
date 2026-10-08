import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { aiRunFile, readAiRun } from "../../core/ai-run-store.ts";
import { fillSecret } from "../fill-secret.ts";
import { recordStep, type RecordStepOptions } from "../record-step.ts";
import { runFinish } from "../run-finish.ts";
import { runStart } from "../run-start.ts";
import { validateTestCases } from "../validate-testcases.ts";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-agent-browser.mjs");
const PASSWORD = "abc123xyz";

const baseCase = {
  title: "Đăng nhập đúng",
  preconditions: [],
  steps: ["Mở trang đăng nhập"],
  expected: ["Vào được dashboard"],
  priority: "High",
  type: "positive",
};

let root: string;
let fakeDir: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "record-step-test-"));
  fakeDir = path.join(root, "fake-ab");
  fs.mkdirSync(fakeDir);
  env = { AGENT_BROWSER_BIN: FAKE, FAKE_AB_DIR: fakeDir };
  const dir = path.join(root, "features", "demo");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "feature.json"),
    JSON.stringify({
      feature: "demo",
      service: "Demo",
      baseURL: "https://demo.example.com",
      viewport: { width: 1280, height: 720 },
      screens: { login: { path: "/login", auth: false } },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "testcases.json"),
    JSON.stringify([
      { ...baseCase, id: "TC_DEMO_001", status: "reviewed" },
      { ...baseCase, id: "TC_DEMO_002", status: "reviewed" },
      { ...baseCase, id: "TC_DEMO_003", status: "draft" },
      { ...baseCase, id: "TC_DEMO_004", status: "reviewed", manual: true },
    ]),
  );
  fs.writeFileSync(path.join(dir, ".env"), `USER_PASSWORD=${PASSWORD}\nUSER_EMAIL=tester@example.com\n`);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const calls = (): string[][] =>
  fs.readFileSync(path.join(fakeDir, "calls.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const step = (o: Partial<RecordStepOptions> & Pick<RecordStepOptions, "action">) =>
  recordStep({ feature: "demo", id: "TC_DEMO_001", root, env, ...o });
const start = (id = "TC_DEMO_001", extra: object = {}) => runStart({ feature: "demo", id, root, env, ...extra });

/** Mọi file dưới `dir`, đọc dạng chuỗi, để kiểm tra không có chuỗi cần giấu. */
function readAll(dir: string): string {
  let out = "";
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    out += e.isDirectory() ? readAll(p) : p.endsWith(".png") ? "" : fs.readFileSync(p, "utf8");
  }
  return out;
}

describe("run-start", () => {
  it("tạo ai-run rỗng với baseURL và viewport của tính năng, in tên session", async () => {
    const r = await start();
    assert.equal(r.session, "ui-check-demo");
    assert.match(path.basename(r.runDir), /^\d{4}-\d{2}-\d{2}_demo$/);
    const run = readAiRun(r.runDir, "TC_DEMO_001");
    assert.deepEqual(run.steps, []);
    assert.equal(run.ai_result, null);
    assert.match(run.started_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    assert.equal(run.baseURL, "https://demo.example.com");
    assert.deepEqual(run.viewport, { width: 1280, height: 720 });
    assert.deepEqual(calls().at(-1)?.at(0), "close", "đóng session cũ để bắt đầu từ trình duyệt sạch");
  });

  it("test case thứ hai cùng ngày dùng chung đợt, chạy lại cùng test case thì mở đợt mới", async () => {
    const a = await start("TC_DEMO_001");
    const b = await start("TC_DEMO_002");
    assert.equal(b.runDir, a.runDir);
    const c = await start("TC_DEMO_001");
    assert.notEqual(c.runDir, a.runDir);
    assert.match(path.basename(c.runDir), /_demo_r2$/);
    assert.ok(fs.existsSync(aiRunFile(a.runDir, "TC_DEMO_001")), "không đụng evidence cũ");
  });

  it("từ chối test case chưa reviewed hoặc manual, --force cho qua kèm cảnh báo", async () => {
    await assert.rejects(start("TC_DEMO_003"), /status "draft"/);
    await assert.rejects(start("TC_DEMO_004"), /manual/);
    await assert.rejects(start("TC_DEMO_999"), /Không có test case/);
    const r = await start("TC_DEMO_003", { force: true });
    assert.ok(r.warnings.some((w) => w.includes("--force")));
  });

  it("--run-dir phải nằm trong evidence", async () => {
    await assert.rejects(start("TC_DEMO_001", { runDir: "../ngoai" }), /nằm trong thư mục evidence/);
    const r = await start("TC_DEMO_001", { runDir: "evidence/2026-01-01_demo" });
    assert.equal(r.runDir, path.join(root, "evidence", "2026-01-01_demo"));
  });
});

describe("record-step", () => {
  it("ghi role, name, thuộc tính, URL trước và sau, ảnh; bỏ qua get attr lỗi", async () => {
    const { runDir } = await start();
    await step({ action: "navigate", value: "/login" });
    const r = await step({ action: "click", ref: "@e3", note: "bấm đăng nhập" });

    assert.equal(r.step.n, 2);
    assert.deepEqual(r.step.target, { role: "button", name: "Đăng nhập", label: null, placeholder: null, css: null });
    assert.equal(r.step.url_before, "https://demo.example.com/login");
    assert.equal(r.step.url_after, "https://demo.example.com/dashboard");
    assert.equal(r.step.screenshot, "screenshots/TC_DEMO_001/02.png");
    assert.equal(r.step.note, "bấm đăng nhập");
    assert.ok(fs.existsSync(path.join(runDir, "screenshots", "TC_DEMO_001", "02.png")));

    const saved = readAiRun(runDir, "TC_DEMO_001");
    assert.deepEqual(saved.steps.map((s) => [s.n, s.action]), [[1, "navigate"], [2, "click"]]);
    assert.equal(saved.steps[0]!.target, null);
    assert.deepEqual(calls().find((c) => c[0] === "open"), ["open", "https://demo.example.com/login"]);
  });

  it("lấy label, placeholder và css từ thuộc tính, bỏ id trông như sinh tự động", async () => {
    await start();
    const email = await step({ action: "fill", ref: "e1", value: "tester@example.com" });
    assert.deepEqual(email.step.target, { role: "textbox", name: "Email", label: "Email", placeholder: "you@example.com", css: "#email" });
    assert.equal(email.step.value, "<secret:USER_EMAIL>", "giá trị trùng .env bị che dù đi qua --value");
    const button = await step({ action: "check", ref: "e3" });
    assert.equal(button.step.target?.css, null);
  });

  it("assert_url và assert_text ghi kết quả kiểm tra vào note", async () => {
    await start();
    await step({ action: "navigate", value: "/login" });
    const ok = await step({ action: "assert_url", value: "**/login" });
    assert.equal(ok.assertion?.passed, true);
    assert.equal(ok.step.target, null);
    const bad = await step({ action: "assert_url", value: "/dashboard" });
    assert.equal(bad.assertion?.passed, false);
    assert.match(bad.step.note, /không khớp/);

    const text = await step({ action: "assert_text", value: "Xin chào" });
    assert.equal(text.assertion?.passed, true);
    const missing = await step({ action: "assert_text", ref: "e1", value: "Tạm biệt" });
    assert.equal(missing.assertion?.passed, false);
    assert.deepEqual(calls().filter((c) => c[0] === "get" && c[1] === "text").map((c) => c[2]), ["body", "@e1"]);
  });

  it("assert_text che credential trong kết quả trả về (thứ in ra stdout cho AI), không chỉ trong file", async () => {
    await start();
    env.FAKE_AB_TEXT = `Mật khẩu ${PASSWORD} sai. Email tester@example.com`;
    const r = await step({ action: "assert_text", value: "Tạm biệt" });
    assert.equal(r.assertion?.passed, false);
    assert.ok(!r.assertion?.detail.includes(PASSWORD), r.assertion?.detail);
    assert.match(r.assertion!.detail, /<secret:USER_PASSWORD>/);
    assert.ok(!JSON.stringify(r).includes(PASSWORD));
    const hit = await step({ action: "assert_text", value: PASSWORD });
    assert.equal(hit.assertion?.passed, true);
    assert.ok(!hit.assertion?.detail.includes(PASSWORD), "giá trị cần tìm cũng không được in ra");
  });

  it("dùng --target-json khi không có ref", async () => {
    await start();
    const r = await step({ action: "click", targetJson: '{"css":"#submit"}' });
    assert.equal(r.step.target?.css, "#submit");
    assert.deepEqual(calls().find((c) => c[0] === "click"), ["click", "#submit"]);
    const byRole = await step({ action: "click", targetJson: '{"role":"button","name":"Gửi"}' });
    assert.equal(byRole.step.target?.name, "Gửi");
    assert.deepEqual(calls().filter((c) => c[0] === "find").at(-1), ["find", "role", "button", "click", "--name", "Gửi"]);
  });

  it("từ chối đầu vào sai mà không ghi step", async () => {
    const { runDir } = await start();
    await assert.rejects(step({ action: "bay" }), /--action không hợp lệ/);
    await assert.rejects(step({ action: "click" }), /cần --ref/);
    await assert.rejects(step({ action: "fill", ref: "e1" }), /cần --value/);
    await assert.rejects(step({ action: "click", ref: "xyz" }), /--ref không hợp lệ/);
    await assert.rejects(step({ action: "click", ref: "e99" }), /Không thấy @e99/);
    await assert.rejects(step({ action: "click", targetJson: "{" }), /không phải JSON/);
    await assert.rejects(step({ action: "click", targetJson: '{"x":1}' }), /sai dạng|cần ít nhất/);
    await assert.rejects(step({ action: "click", ref: "e3", id: "TC_DEMO_002" }), /Chạy run-start/);
    assert.equal(readAiRun(runDir, "TC_DEMO_001").steps.length, 0);
  });

  it("lỗi chụp ảnh không làm mất step đã làm xong", async () => {
    const { runDir } = await start();
    const r = await step({ action: "click", ref: "e3" });
    assert.equal(r.step.screenshot !== null, true);
    env.FAKE_AB_FAIL = "screenshot";
    const r2 = await step({ action: "click", ref: "e3" });
    assert.equal(r2.step.screenshot, null);
    assert.match(r2.step.note, /Không chụp được ảnh/);
    assert.equal(readAiRun(runDir, "TC_DEMO_001").steps.length, 2);
  });

  it("báo rõ khi không có agent-browser", async () => {
    await start();
    env.AGENT_BROWSER_BIN = path.join(root, "khong-co-lenh");
    await assert.rejects(step({ action: "navigate", value: "/x" }), /Không tìm thấy lệnh/);
  });
});

describe("fill-secret", () => {
  it("điền giá trị thật cho trình duyệt nhưng không để lộ ở bất cứ file hay đầu ra nào", async () => {
    const { runDir } = await start();
    const r = await fillSecret({ feature: "demo", id: "TC_DEMO_001", ref: "e2", key: "USER_PASSWORD", root, env });

    assert.deepEqual(calls().find((c) => c[0] === "fill"), ["fill", "@e2", PASSWORD], "trình duyệt nhận giá trị thật");
    assert.equal(r.step.value, "<secret:USER_PASSWORD>");
    assert.equal(r.step.action, "fill");
    assert.deepEqual(r.step.target?.role, "textbox");
    assert.ok(!JSON.stringify(r).includes(PASSWORD));
    assert.ok(!readAll(runDir).includes(PASSWORD), "evidence không chứa giá trị");
  });

  it("lỗi từ agent-browser có chứa giá trị thì bị che", async () => {
    await start();
    env.FAKE_AB_FAIL = "fill";
    await assert.rejects(
      fillSecret({ feature: "demo", id: "TC_DEMO_001", ref: "e2", key: "USER_PASSWORD", root, env }),
      (err: Error) => {
        assert.ok(!err.message.includes(PASSWORD), err.message);
        assert.match(err.message, /<secret:USER_PASSWORD>/);
        return true;
      },
    );
  });

  it("thiếu khóa thì báo tên các khóa có sẵn, không in giá trị", async () => {
    await start();
    await assert.rejects(
      fillSecret({ feature: "demo", id: "TC_DEMO_001", ref: "e2", key: "NOPE", root, env }),
      (err: Error) => {
        assert.match(err.message, /Không có khóa NOPE/);
        assert.match(err.message, /USER_EMAIL, USER_PASSWORD/);
        assert.ok(!err.message.includes(PASSWORD));
        return true;
      },
    );
  });
});

describe("run-finish", () => {
  const result = { verdict: "ĐẠT", per_expected: [{ expected: "Vào được dashboard", verdict: "ĐẠT", observation: "URL cuối /dashboard" }] };

  it("ghi ai_result, đóng session, không đổi status test case", async () => {
    const { runDir } = await start();
    await step({ action: "click", ref: "e3" });
    const file = path.join(root, "result.json");
    fs.writeFileSync(file, JSON.stringify(result));
    const before = fs.readFileSync(path.join(root, "features", "demo", "testcases.json"), "utf8");

    const r = await runFinish({ feature: "demo", id: "TC_DEMO_001", resultFile: file, root, env });
    assert.equal(r.run.ai_result?.verdict, "ĐẠT");
    assert.equal(readAiRun(runDir, "TC_DEMO_001").ai_result?.per_expected.length, 1);
    assert.equal(calls().at(-1)?.[0], "close");
    assert.equal(fs.readFileSync(path.join(root, "features", "demo", "testcases.json"), "utf8"), before);
    await assert.rejects(step({ action: "click", ref: "e3" }), /đã run-finish/);
  });

  it("từ chối file kết quả sai schema hoặc không tồn tại, che credential trong quan sát", async () => {
    const { runDir } = await start();
    const bad = path.join(root, "bad.json");
    fs.writeFileSync(bad, JSON.stringify({ verdict: "PASS", per_expected: [] }));
    await assert.rejects(runFinish({ feature: "demo", id: "TC_DEMO_001", resultFile: bad, root, env }), /không hợp lệ/);
    await assert.rejects(runFinish({ feature: "demo", id: "TC_DEMO_001", resultFile: path.join(root, "none.json"), root, env }), /Không tìm thấy/);

    const leaky = path.join(root, "leaky.json");
    fs.writeFileSync(leaky, JSON.stringify({ ...result, per_expected: [{ ...result.per_expected[0], observation: `ô hiện ${PASSWORD}` }] }));
    await runFinish({ feature: "demo", id: "TC_DEMO_001", resultFile: leaky, root, env });
    assert.ok(!readAll(runDir).includes(PASSWORD));
  });

  it("chỉ đọc file kết quả trong project hoặc thư mục đợt, từ chối .env và auth/, không echo nội dung file", async () => {
    const { runDir } = await start();
    const finish = (resultFile: string) => runFinish({ feature: "demo", id: "TC_DEMO_001", resultFile, root, env });
    await assert.rejects(finish("features/demo/.env"), (err: Error) => /nhạy cảm/.test(err.message) && !err.message.includes("USER_PASS"));
    fs.mkdirSync(path.join(root, "auth"));
    fs.writeFileSync(path.join(root, "auth", "demo.json"), "{}");
    await assert.rejects(finish("auth/demo.json"), /nhạy cảm/);
    const outside = path.join(os.tmpdir(), `outside-${process.pid}.json`);
    fs.writeFileSync(outside, JSON.stringify(result));
    try {
      await assert.rejects(finish(outside), /--result-file phải nằm trong/);
    } finally {
      fs.rmSync(outside, { force: true });
    }
    // Không phải JSON: thông báo chung, không trích đầu file.
    fs.writeFileSync(path.join(root, "notes.txt"), "SECRETWORD=xyz không phải json");
    await assert.rejects(finish("notes.txt"), (err: Error) => /không phải JSON hợp lệ/.test(err.message) && !err.message.includes("SECRETWORD"));
    // Trong thư mục đợt thì được, kể cả khi thư mục đợt nằm ngoài project.
    const inRun = path.join(runDir, "ai-result-TC_DEMO_001.tmp");
    fs.writeFileSync(inRun, JSON.stringify(result));
    assert.equal((await finish(inRun)).run.ai_result?.verdict, "ĐẠT");
  });
});

describe("validate-testcases", () => {
  it("thống kê theo loại và status, cảnh báo screen lạ và OTP chưa đánh dấu manual", () => {
    const file = path.join(root, "features", "demo", "testcases.json");
    const cases = JSON.parse(fs.readFileSync(file, "utf8"));
    cases[0].screen = "khong-co";
    cases[1].steps = ["Nhập mã OTP"];
    fs.writeFileSync(file, JSON.stringify(cases));
    const r = validateTestCases("demo", { root });
    assert.equal(r.total, 4);
    assert.deepEqual(r.byType, { positive: 4 });
    assert.deepEqual(r.byStatus, { reviewed: 3, draft: 1 });
    assert.equal(r.warnings.length, 2);
  });

  it("ném lỗi khi sai schema", () => {
    fs.writeFileSync(path.join(root, "features", "demo", "testcases.json"), JSON.stringify([{ id: "A" }]));
    assert.throws(() => validateTestCases("demo", { root }), /testcases.json không hợp lệ/);
  });
});
