import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CASE, setup, type TestEnv } from "./helpers.ts";

const FAKE_PW = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "core", "__tests__", "fake-playwright.mjs");
const RUN = "2026-10-07_demo";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let t: TestEnv;
const p = (...parts: string[]) => path.join(t.root, ...parts);
const runDir = () => p("evidence", RUN);
const json = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const tcList = () => json(p("features", "demo", "testcases.json")) as { id: string; status: string }[];

const AI_RUN = {
  id: "TC_DEMO_001",
  feature: "demo",
  baseURL: "https://demo.example.com",
  viewport: { width: 1280, height: 720 },
  started_at: "2026-10-07T10:00:00+07:00",
  steps: [
    { n: 1, action: "navigate", target: null, value: "/", url_before: null, url_after: "https://demo.example.com/", screenshot: "screenshots/TC_DEMO_001/01.png", note: "" },
    { n: 2, action: "fill", target: { role: "textbox", name: "Mật khẩu", label: null, placeholder: null, css: null }, value: "<secret:USER_PASSWORD>", url_before: "https://demo.example.com/", url_after: "https://demo.example.com/", screenshot: null, note: "" },
  ],
  ai_result: { verdict: "KHÔNG ĐẠT", per_expected: [{ expected: "Vào được trang chủ", verdict: "KHÔNG ĐẠT", observation: "Báo lỗi 500" }] },
  tester: { decision: null, note: "", decided_at: null },
};

function seed(status = "reviewed", aiRun: object = AI_RUN) {
  fs.rmSync(runDir(), { recursive: true, force: true });
  fs.mkdirSync(path.join(runDir(), "ai-run"), { recursive: true });
  fs.mkdirSync(path.join(runDir(), "screenshots", "TC_DEMO_001"), { recursive: true });
  fs.writeFileSync(path.join(runDir(), "screenshots", "TC_DEMO_001", "01.png"), PNG);
  fs.writeFileSync(path.join(runDir(), "ai-run", "TC_DEMO_001.json"), JSON.stringify(aiRun));
  fs.writeFileSync(path.join(runDir(), "ai-run", "TC_DEMO_001.md"), "# Báo cáo AI\nBáo lỗi 500");
  fs.writeFileSync(p("features", "demo", "testcases.json"), JSON.stringify([{ ...CASE, status }]));
}

before(async () => {
  t = await setup({ env: { ...process.env, PLAYWRIGHT_BIN: FAKE_PW }, killGraceMs: 300 });
});
after(() => t.cleanup());

describe("API ai-run", () => {
  it("liệt kê theo đợt kèm nội dung .md, không lộ đường dẫn tuyệt đối", async () => {
    seed();
    const r = await t.call("GET", `/api/runs/${RUN}/ai-runs`);
    assert.equal(r.status, 200);
    assert.equal(r.body.feature, "demo");
    assert.equal(r.body.ai_runs.length, 1);
    const a = r.body.ai_runs[0];
    assert.equal(a.id, "TC_DEMO_001");
    assert.equal(a.title, CASE.title);
    assert.equal(a.status, "reviewed");
    assert.match(a.md, /Báo lỗi 500/);
    assert.equal(a.steps.length, 2);
    assert.ok(!JSON.stringify(r.body).includes(t.root));
  });

  it("đợt không tồn tại hoặc tên sai", async () => {
    assert.equal((await t.call("GET", "/api/runs/2026-10-07_khong-co/ai-runs")).status, 404);
    assert.equal((await t.call("GET", "/api/runs/abc/ai-runs")).status, 400);
  });

  it("Từ chối: ghi tester vào ai-run, đổi status ai-failed, thêm bugs.md", async () => {
    seed();
    const r = await t.call("POST", `/api/runs/${RUN}/ai-runs/TC_DEMO_001/decision`, { decision: "rejected", note: "Lỗi thật", suspected_bug: "Đăng nhập đúng mà báo 500" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "ai-failed");
    assert.ok(!JSON.stringify(r.body).includes(t.root));

    const run = json(path.join(runDir(), "ai-run", "TC_DEMO_001.json"));
    assert.equal(run.tester.decision, "rejected");
    assert.equal(run.tester.note, "Lỗi thật");
    assert.match(run.tester.decided_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    assert.equal(run.steps.length, 2, "steps không bị đụng tới");
    assert.equal(run.ai_result.verdict, "KHÔNG ĐẠT");
    assert.equal(tcList()[0]!.status, "ai-failed");

    const bugs = fs.readFileSync(path.join(runDir(), "bugs.md"), "utf8");
    assert.match(bugs, /## TC_DEMO_001 - Đăng nhập đúng/);
    assert.match(bugs, /Nghi bug: Đăng nhập đúng mà báo 500/);
    assert.match(bugs, /Ghi chú tester: Lỗi thật/);
  });

  it("Quyết định lại thay mục bug cũ thay vì thêm trùng", async () => {
    seed();
    await t.call("POST", `/api/runs/${RUN}/ai-runs/TC_DEMO_001/decision`, { decision: "rejected", note: "", suspected_bug: "bản một" });
    await t.call("POST", `/api/runs/${RUN}/ai-runs/TC_DEMO_001/decision`, { decision: "rejected", note: "", suspected_bug: "bản hai" });
    const bugs = fs.readFileSync(path.join(runDir(), "bugs.md"), "utf8");
    assert.equal(bugs.match(/## TC_DEMO_001/g)!.length, 1);
    assert.match(bugs, /bản hai/);
    assert.ok(!bugs.includes("bản một"));
  });

  it("Xác nhận: ai-passed, không có bugs.md khi không nghi bug", async () => {
    seed("reviewed", { ...AI_RUN, ai_result: { verdict: "ĐẠT", per_expected: [] } });
    const r = await t.call("POST", `/api/runs/${RUN}/ai-runs/TC_DEMO_001/decision`, { decision: "confirmed", note: "ok" });
    assert.equal(r.status, 200);
    assert.equal(tcList()[0]!.status, "ai-passed");
    assert.equal(json(path.join(runDir(), "ai-run", "TC_DEMO_001.json")).tester.decision, "confirmed");
    assert.ok(!fs.existsSync(path.join(runDir(), "bugs.md")));
  });

  it("từ chối đầu vào sai và không ghi gì", async () => {
    seed("draft");
    const before = fs.readFileSync(path.join(runDir(), "ai-run", "TC_DEMO_001.json"), "utf8");
    const url = `/api/runs/${RUN}/ai-runs/TC_DEMO_001/decision`;
    assert.equal((await t.call("POST", url, { decision: "maybe" })).status, 400);
    assert.equal((await t.call("POST", url, {})).status, 400);
    assert.equal((await t.call("POST", url, { decision: "rejected" })).status, 409, "draft chưa duyệt");
    assert.equal((await t.call("POST", `/api/runs/${RUN}/ai-runs/TC_KHAC/decision`, { decision: "rejected" })).status, 404);
    assert.equal((await t.call("POST", `/api/runs/${RUN}/ai-runs/..%2Fx/decision`, { decision: "rejected" })).status, 400);
    assert.equal(fs.readFileSync(path.join(runDir(), "ai-run", "TC_DEMO_001.json"), "utf8"), before);
    assert.equal(tcList()[0]!.status, "draft");

    seed("automated");
    assert.equal((await t.call("POST", url, { decision: "rejected" })).status, 409, "automated");
    seed("reviewed", { ...AI_RUN, ai_result: null });
    assert.equal((await t.call("POST", url, { decision: "confirmed" })).status, 409, "chưa có ai_result");
    assert.equal(tcList()[0]!.status, "reviewed");
  });
});

describe("API file trong đợt", () => {
  const files = (rel: string) => `/api/runs/${RUN}/files/${rel}`;
  const raw = async (rel: string) => fetch(t.url + files(rel));

  it("phục vụ ảnh, md, json", async () => {
    seed();
    const img = await raw("screenshots/TC_DEMO_001/01.png");
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
    assert.equal((await raw("ai-run/TC_DEMO_001.md")).status, 200);
    assert.equal((await raw("ai-run/TC_DEMO_001.json")).status, 200);
  });

  it("chặn .. và đường dẫn thoát khỏi thư mục đợt", async () => {
    seed();
    fs.writeFileSync(p("evidence", "ngoai.json"), "{}");
    fs.writeFileSync(p("features", "demo", ".env"), "KEY=bi-mat");
    for (const rel of ["..%2Fngoai.json", "%2e%2e/ngoai.json", "ai-run/..%2F..%2Fngoai.json", "..%2F..%2Ffeatures%2Fdemo%2F.env", "%2Fetc%2Fpasswd", "a%5C..%5Cb.json"]) {
      const res = await raw(rel);
      assert.ok([400, 403, 404].includes(res.status), `${rel} -> ${res.status}`);
      assert.ok(!(await res.text()).includes("bi-mat"));
    }
    // fetch giữ nguyên "..": gửi thẳng bằng http để chắc chắn server nhận dấu ..
    const net = await import("node:http");
    const status = await new Promise<number>((resolve) => {
      net.get({ host: "127.0.0.1", port: t.server.port, path: `/api/runs/${RUN}/files/../ngoai.json` }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
    });
    assert.notEqual(status, 200);
  });

  it("chỉ cho phép .png .md .json .txt .html", async () => {
    seed();
    fs.writeFileSync(path.join(runDir(), "nguy-hiem.sh"), "echo");
    fs.writeFileSync(path.join(runDir(), "a.html"), "<p>x</p>");
    assert.equal((await raw("nguy-hiem.sh")).status, 403);
    assert.equal((await raw("ai-run")).status, 403, "thư mục không có đuôi");
    const html = await raw("a.html");
    assert.equal(html.status, 200);
    assert.equal(html.headers.get("content-security-policy"), "sandbox");
    assert.equal((await raw("khong-co.png")).status, 404);
  });

  it("không đi theo symlink ra ngoài thư mục đợt", async () => {
    seed();
    fs.writeFileSync(p("evidence", "ngoai.txt"), "bi-mat");
    fs.symlinkSync(p("evidence", "ngoai.txt"), path.join(runDir(), "lien-ket.txt"));
    const res = await raw("lien-ket.txt");
    assert.equal(res.status, 400);
    assert.ok(!(await res.text()).includes("bi-mat"));
  });
});

describe("API Playwright và đưa vào regression", () => {
  const waitFor = async (cond: () => Promise<boolean>, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await cond()) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.fail("hết thời gian chờ");
  };
  const idle = async () => (await t.call("GET", `/api/features/demo/playwright?run=${RUN}`)).body.running === null;
  const specPath = (n: string) => p("tests", "demo", n);
  const writeSpec = (n: string) => {
    fs.mkdirSync(p("tests", "demo"), { recursive: true });
    fs.writeFileSync(specPath(n), "// spec giả\n");
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(specPath(n), past, past);
  };
  const automate = () => t.call("POST", "/api/features/demo/testcases/TC_DEMO_001/automate", { run: RUN });

  it("từ chối spec sai đường dẫn, chưa có spec, đợt không có", async () => {
    seed("ai-passed");
    fs.rmSync(p("tests"), { recursive: true, force: true });
    assert.equal((await t.call("POST", "/api/features/demo/playwright/run", { run: RUN })).status, 409);
    writeSpec("TC_DEMO_001.spec.ts");
    for (const spec of ["tests/demo/../x.spec.ts", "tests/khac/TC_DEMO_001.spec.ts", "/etc/passwd", "tests/demo/x.ts", "tests/demo/khong-co.spec.ts"]) {
      const r = await t.call("POST", "/api/features/demo/playwright/run", { run: RUN, spec });
      assert.ok([400, 404].includes(r.status), `${spec} -> ${r.status}`);
    }
    assert.equal((await t.call("POST", "/api/features/demo/playwright/run", { run: "2026-10-08_demo" })).status, 404);
  });

  it("automate từ chối khi chưa có spec, chưa chạy, không có test, fail, hoặc spec sửa sau khi chạy", async () => {
    seed("ai-passed");
    fs.rmSync(p("tests"), { recursive: true, force: true });
    let r = await automate();
    assert.equal(r.status, 409);
    assert.match(r.body.error, /chưa có tests\/demo\/TC_DEMO_001\.spec\.ts/);

    writeSpec("TC_DEMO_001.spec.ts");
    r = await automate();
    assert.equal(r.status, 409);
    assert.match(r.body.error, /chưa chạy Playwright/);

    const last = (tests: unknown[], finished = new Date().toISOString()) =>
      fs.writeFileSync(path.join(runDir(), "playwright-last.json"), JSON.stringify({ feature: "demo", spec: null, exit_code: 1, stopped: false, started_at: finished.replace("Z", "+00:00"), finished_at: finished.replace("Z", "+00:00"), tests }));

    last([{ file: "TC_KHAC.spec.ts", title: "x", status: "passed", duration_ms: 1 }]);
    r = await automate();
    assert.equal(r.status, 409);
    assert.match(r.body.error, /không có test của/);

    last([{ file: "TC_DEMO_001.spec.ts", title: "x", status: "failed", duration_ms: 1 }]);
    r = await automate();
    assert.equal(r.status, 409);
    assert.match(r.body.error, /chưa pass/);

    last([{ file: "TC_DEMO_001.spec.ts", title: "x", status: "passed", duration_ms: 1 }], new Date(Date.now() - 3_600_000).toISOString());
    r = await automate();
    assert.equal(r.status, 409);
    assert.match(r.body.error, /đã được sửa sau/);

    assert.equal(tcList()[0]!.status, "ai-passed", "status không đổi khi bị từ chối");
    assert.equal((await t.call("POST", "/api/features/demo/testcases/TC_DEMO_001/automate", {})).status, 400);
  });

  it("automate chỉ áp dụng cho ai-passed; PATCH vẫn chặn automated", async () => {
    seed("reviewed");
    writeSpec("TC_DEMO_001.spec.ts");
    assert.equal((await automate()).status, 409);
    assert.equal((await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { status: "automated" })).status, 409);
  });

  it("chạy spec thật qua API: log, last.json, 409 khi chạy song song, rồi automate thành công", async () => {
    seed("ai-passed");
    fs.rmSync(p("tests"), { recursive: true, force: true });
    writeSpec("TC_DEMO_001.spec.ts");
    writeSpec("TC_slow.spec.ts");

    // chạy chậm để thử song song và dừng
    let r = await t.call("POST", "/api/features/demo/playwright/run", { run: RUN, spec: "tests/demo/TC_slow.spec.ts" });
    assert.equal(r.status, 202);
    assert.equal((await t.call("POST", "/api/features/demo/playwright/run", { run: RUN })).status, 409);
    assert.equal((await t.call("GET", `/api/features/demo/playwright?run=${RUN}`)).body.running.spec, "tests/demo/TC_slow.spec.ts");
    assert.equal((await t.call("POST", "/api/features/demo/playwright/stop")).status, 200);
    assert.equal((await t.call("POST", "/api/features/demo/playwright/stop")).status, 409, "không còn gì để dừng");
    assert.equal(json(path.join(runDir(), "playwright-last.json")).stopped, true);

    r = await t.call("POST", "/api/features/demo/playwright/run", { run: RUN, spec: "tests/demo/TC_DEMO_001.spec.ts" });
    assert.equal(r.status, 202);
    await waitFor(idle);
    const state = (await t.call("GET", `/api/features/demo/playwright?run=${RUN}`)).body;
    assert.equal(state.last.exit_code, 0);
    assert.deepEqual(state.specs, ["TC_DEMO_001.spec.ts", "TC_slow.spec.ts"]);
    assert.ok(!JSON.stringify(state).includes(t.root));
    assert.match(fs.readFileSync(path.join(runDir(), "playwright-log.txt"), "utf8"), /fake playwright test/);

    r = await automate();
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(tcList()[0]!.status, "automated");
  });

  it("report phục vụ ở /report/<đợt>/", async () => {
    seed();
    assert.equal((await fetch(`${t.url}/report/${RUN}/`)).status, 404);
    fs.mkdirSync(path.join(runDir(), "playwright-report"), { recursive: true });
    fs.writeFileSync(path.join(runDir(), "playwright-report", "index.html"), "<h1>report</h1>");
    const res = await fetch(`${t.url}/report/${RUN}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /report/);
    assert.equal((await fetch(`${t.url}/report/${RUN}/..%2Fai-run%2FTC_DEMO_001.json`)).status, 404);
    assert.equal((await fetch(`${t.url}/report/abc/`)).status, 400);
  });
});
