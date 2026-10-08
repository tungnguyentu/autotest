import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { compareDir } from "../../cli/compare.ts";
import { applyHeal } from "../heal-apply.ts";
import { automateTestcase, decideAiRun, ReviewError, setTestcaseStatus } from "../review.ts";
import { featureStatus } from "../status.ts";
import { createBaseline, saveUiDecisions } from "../ui-diff-gates.ts";

// Các điểm duyệt của tester, gọi qua CLI khi tester nói quyết định trong chat.

const FAKE_PW = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-playwright.mjs");
const RUN = "2026-10-07_demo";
const FEATURE = {
  feature: "demo",
  service: "Demo",
  baseURL: "https://demo.example.com",
  viewport: { width: 160, height: 100 },
  screens: { home: { path: "/", auth: false } },
};
const CASE = {
  id: "TC_DEMO_001",
  title: "Đăng nhập đúng",
  preconditions: [],
  steps: ["Mở trang"],
  expected: ["Vào được trang chủ"],
  priority: "High",
  type: "positive",
  status: "draft",
};
const AI_RUN = {
  id: "TC_DEMO_001",
  feature: "demo",
  baseURL: "https://demo.example.com",
  viewport: { width: 160, height: 100 },
  started_at: "2026-10-07T10:00:00+07:00",
  steps: [{ n: 1, action: "navigate", target: null, value: "/", url_before: null, url_after: "https://demo.example.com/", screenshot: null, note: "" }],
  ai_result: { verdict: "ĐẠT", per_expected: [{ expected: "Vào được trang chủ", verdict: "ĐẠT", observation: "Thấy trang chủ" }] },
  tester: { decision: null, note: "", decided_at: null },
};

let root: string;
const p = (...parts: string[]) => path.join(root, ...parts);
const runDir = () => p("evidence", RUN);
const json = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const cases = () => json(p("features", "demo", "testcases.json")) as { id: string; status: string }[];
const seedCases = (...list: object[]) => fs.writeFileSync(p("features", "demo", "testcases.json"), JSON.stringify(list));
const env = { ...process.env, PLAYWRIGHT_BIN: FAKE_PW, HEADLESS: "true" };
const opts = () => ({ root, env, onLine: () => {} });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "review-"));
  fs.mkdirSync(p("features", "demo"), { recursive: true });
  fs.writeFileSync(p("features", "demo", "feature.json"), JSON.stringify(FEATURE));
  fs.mkdirSync(path.join(runDir(), "ai-run"), { recursive: true });
});

describe("duyệt test case", () => {
  it("đổi draft thành reviewed và ngược lại", () => {
    seedCases(CASE, { ...CASE, id: "TC_DEMO_002" });
    const changed = setTestcaseStatus("demo", ["TC_DEMO_001", "TC_DEMO_002"], "reviewed", { root });
    assert.equal(changed.length, 2);
    assert.deepEqual(cases().map((c) => c.status), ["reviewed", "reviewed"]);
    setTestcaseStatus("demo", ["TC_DEMO_002"], "draft", { root });
    assert.deepEqual(cases().map((c) => c.status), ["reviewed", "draft"]);
  });

  it("không đổi trạng thái do bước khác đặt, không ghi gì khi một mã sai", () => {
    seedCases({ ...CASE, status: "automated" }, { ...CASE, id: "TC_DEMO_002" });
    assert.throws(() => setTestcaseStatus("demo", ["TC_DEMO_002", "TC_DEMO_001"], "reviewed", { root }), ReviewError);
    assert.throws(() => setTestcaseStatus("demo", ["TC_NONE"], "reviewed", { root }), /Không tìm thấy/);
    assert.deepEqual(cases().map((c) => c.status), ["automated", "draft"]);
  });
});

describe("quyết định kết quả AI chạy thử", () => {
  const seedRun = (aiRun: object = AI_RUN) => fs.writeFileSync(path.join(runDir(), "ai-run", "TC_DEMO_001.json"), JSON.stringify(aiRun));

  it("xác nhận: ghi tester vào ai-run, status thành ai-passed", () => {
    seedCases({ ...CASE, status: "reviewed" });
    seedRun();
    const r = decideAiRun("demo", runDir(), "TC_DEMO_001", { decision: "confirmed", note: "đúng" }, { root });
    assert.equal(r.status, "ai-passed");
    assert.equal(cases()[0]!.status, "ai-passed");
    const a = json(path.join(runDir(), "ai-run", "TC_DEMO_001.json"));
    assert.equal(a.tester.decision, "confirmed");
    assert.equal(a.tester.note, "đúng");
  });

  it("từ chối kèm bug: status ai-failed, ghi bugs.md", () => {
    seedCases({ ...CASE, status: "reviewed" });
    seedRun();
    const r = decideAiRun("demo", runDir(), "TC_DEMO_001", { decision: "rejected", suspectedBug: "Nút lưu không phản hồi" }, { root });
    assert.equal(r.status, "ai-failed");
    assert.equal(r.bug_recorded, true);
    assert.match(fs.readFileSync(path.join(runDir(), "bugs.md"), "utf8"), /Nút lưu không phản hồi/);
  });

  it("chặn xác nhận khi AI chưa ghi kết quả, chặn test case draft", () => {
    seedCases({ ...CASE, status: "reviewed" });
    seedRun({ ...AI_RUN, ai_result: null });
    assert.throws(() => decideAiRun("demo", runDir(), "TC_DEMO_001", { decision: "confirmed" }, { root }), /chưa có ai_result/);
    seedCases(CASE);
    seedRun();
    assert.throws(() => decideAiRun("demo", runDir(), "TC_DEMO_001", { decision: "confirmed" }, { root }), /draft/);
    assert.equal(json(path.join(runDir(), "ai-run", "TC_DEMO_001.json")).tester.decision, null);
  });
});

describe("đưa vào regression", () => {
  const spec = () => p("tests", "demo", "TC_DEMO_001.spec.ts");
  const writeLast = (status: string, finishedAt = new Date(Date.now() + 60_000).toISOString()) =>
    fs.writeFileSync(
      path.join(runDir(), "playwright-last.json"),
      JSON.stringify({ feature: "demo", run: RUN, spec: "tests/demo/TC_DEMO_001.spec.ts", started_at: finishedAt, finished_at: finishedAt, exit_code: status === "passed" ? 0 : 1, stopped: false, tests: [{ file: "TC_DEMO_001.spec.ts", title: "t", status, duration_ms: 5 }] }),
    );

  it("chặn khi chưa ai-passed, chưa có spec, chưa chạy, spec fail; cho phép khi pass", () => {
    seedCases({ ...CASE, status: "reviewed" });
    assert.throws(() => automateTestcase("demo", runDir(), "TC_DEMO_001", { root }), /ai-passed/);
    seedCases({ ...CASE, status: "ai-passed" });
    assert.throws(() => automateTestcase("demo", runDir(), "TC_DEMO_001", { root }), /chưa có tests/);
    fs.mkdirSync(path.dirname(spec()), { recursive: true });
    fs.writeFileSync(spec(), "test");
    assert.throws(() => automateTestcase("demo", runDir(), "TC_DEMO_001", { root }), /chưa chạy Playwright/);
    writeLast("failed");
    assert.throws(() => automateTestcase("demo", runDir(), "TC_DEMO_001", { root }), /chưa pass/);
    writeLast("passed");
    assert.equal(automateTestcase("demo", runDir(), "TC_DEMO_001", { root }).status, "automated");
    assert.equal(cases()[0]!.status, "automated");
  });

  it("chặn khi spec sửa sau lần chạy gần nhất", () => {
    seedCases({ ...CASE, status: "ai-passed" });
    fs.mkdirSync(path.dirname(spec()), { recursive: true });
    fs.writeFileSync(spec(), "test");
    writeLast("passed", new Date(Date.now() - 60_000).toISOString());
    assert.throws(() => automateTestcase("demo", runDir(), "TC_DEMO_001", { root }), /đã được sửa/);
  });
});

describe("áp healing", () => {
  const SPEC = "test('TC_heal', async ({ page }) => {\n  await page.getByRole('link', { name: 'Learn moar' }).click();\n  await expect(page).toHaveURL(/x/);\n});\n";
  const GOOD = "@@ -1,3 +1,3 @@\n test('TC_heal', async ({ page }) => {\n-  await page.getByRole('link', { name: 'Learn moar' }).click();\n+  await page.getByRole('link', { name: 'Learn more' }).click();\n   await expect(page).toHaveURL(/x/);\n";
  const BAD = "@@ -1,3 +1,3 @@\n test('TC_heal', async ({ page }) => {\n   await page.getByRole('link', { name: 'Learn moar' }).click();\n-  await expect(page).toHaveURL(/x/);\n+  await expect(page).toHaveURL(/y/);\n";
  const spec = () => p("tests", "demo", "TC_heal.spec.ts");
  const seed = (diff: string) => {
    fs.mkdirSync(path.join(runDir(), "heal"), { recursive: true });
    fs.mkdirSync(path.dirname(spec()), { recursive: true });
    fs.writeFileSync(spec(), SPEC);
    fs.writeFileSync(path.join(runDir(), "heal", "TC_heal.diff"), diff);
  };

  it("áp diff chỉ đổi locator: sao lưu, sửa spec, chạy lại; lần hai giữ .bak gốc", async () => {
    seed(GOOD);
    const r = await applyHeal({ ...opts(), feature: "demo", runDir: runDir(), id: "TC_heal" });
    assert.equal(r.passed, true);
    assert.equal(r.backup, `evidence/${RUN}/heal/TC_heal.spec.ts.bak`);
    assert.match(fs.readFileSync(spec(), "utf8"), /Learn more/);
    assert.equal(fs.readFileSync(path.join(runDir(), "heal", "TC_heal.spec.ts.bak"), "utf8"), SPEC);
    fs.writeFileSync(path.join(runDir(), "heal", "TC_heal.diff"), GOOD.replace("moar", "more").replace("more' }).click();\n   await", "all' }).click();\n   await"));
    const r2 = await applyHeal({ ...opts(), feature: "demo", runDir: runDir(), id: "TC_heal" });
    assert.equal(r2.backup, `evidence/${RUN}/heal/TC_heal.spec.ts.bak.2`);
    assert.equal(fs.readFileSync(path.join(runDir(), "heal", "TC_heal.spec.ts.bak"), "utf8"), SPEC);
  });

  it("từ chối diff chạm expect, spec nguyên vẹn, không sao lưu", async () => {
    seed(BAD);
    await assert.rejects(applyHeal({ ...opts(), feature: "demo", runDir: runDir(), id: "TC_heal" }), /expect/);
    assert.equal(fs.readFileSync(spec(), "utf8"), SPEC);
    assert.ok(!fs.existsSync(path.join(runDir(), "heal", "TC_heal.spec.ts.bak")));
  });
});

describe("so Figma: quyết định và baseline", () => {
  const REPORT = `# UI check - home

## Sai khác đề xuất

| # | Vùng | Hạng mục | Figma | Thực tế | Mức | Phân loại |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | region_01 | Kích thước | Nút cao ~48px | ~40px | Trung bình | Sai khác thật |
| 2 | region_02 | Nội dung | "A" | "B" | Cao | Sai khác thật |

## Quyết định của tester
`;
  const png = (red: boolean) => {
    const img = new PNG({ width: 160, height: 100 });
    for (let i = 0; i < img.data.length; i += 4) {
      const inBlock = red && (i / 4) % 160 > 30 && (i / 4) % 160 < 80 && Math.floor(i / 4 / 160) > 30 && Math.floor(i / 4 / 160) < 60;
      img.data[i] = inBlock ? 220 : 255;
      img.data[i + 1] = inBlock ? 30 : 255;
      img.data[i + 2] = inBlock ? 30 : 255;
      img.data[i + 3] = 255;
    }
    return PNG.sync.write(img);
  };
  const seedScreen = () => {
    const dir = path.join(runDir(), "ui-diff", "home");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "actual.png"), png(true));
    fs.writeFileSync(path.join(dir, "figma.png"), png(false));
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ screen: "home", captured_at: "2026-10-07T10:00:00+07:00", viewport: { width: 160, height: 100 }, full_page: false, scale: 1, mask_boxes: [], warnings: [] }));
    compareDir({ dir });
    const later = new Date(Date.now() + 2000);
    fs.writeFileSync(path.join(dir, "report.md"), REPORT);
    fs.utimesSync(path.join(dir, "report.md"), later, later);
    fs.mkdirSync(p("tests", "demo"), { recursive: true });
    fs.writeFileSync(p("tests", "demo", "TC_DEMO_001.spec.ts"), `test("t", async ({ page }) => { await expect(page).toHaveScreenshot('home.png'); });\n`);
  };
  const baseline = () => createBaseline({ ...opts(), feature: "demo", runDir: runDir(), screen: "home" });

  it("kiểm tra số mục, chặn baseline khi chưa quyết định hết hoặc còn bug", async () => {
    seedScreen();
    assert.throws(() => saveUiDecisions(runDir(), "home", [{ index: 3, decision: "bug", note: "" }]), /không có trong bảng/);
    assert.throws(() => saveUiDecisions(runDir(), "home", [{ index: 1, decision: "bug", note: "" }, { index: 1, decision: "accept", note: "" }]), /trùng/);
    await assert.rejects(baseline(), /chưa quyết định/i);
    saveUiDecisions(runDir(), "home", [{ index: 1, decision: "accept", note: "" }]);
    await assert.rejects(baseline(), /còn 1 mục/);
    saveUiDecisions(runDir(), "home", [{ index: 1, decision: "accept", note: "" }, { index: 2, decision: "bug", note: "lệch" }]);
    await assert.rejects(baseline(), /Bug/);
    assert.ok(!fs.existsSync(p("tests", "__screenshots__", "demo", "home.png")));
  });

  it("đủ điều kiện: tạo ảnh baseline và baseline.json", async () => {
    seedScreen();
    saveUiDecisions(runDir(), "home", [{ index: 1, decision: "accept", note: "" }, { index: 2, decision: "review", note: "" }]);
    // fake Playwright ghi ảnh theo đường dẫn tương đối thư mục làm việc của runner (gốc project).
    const r = await baseline();
    assert.equal(r.baseline.screenshot, "tests/__screenshots__/demo/home.png");
    assert.ok(fs.existsSync(p("tests", "__screenshots__", "demo", "home.png")));
    assert.equal(json(path.join(runDir(), "ui-diff", "home", "baseline.json")).run, RUN);
  });
});

describe("tiến độ và việc tiếp theo", () => {
  it("nói tester cần làm gì theo từng giai đoạn", () => {
    assert.match(featureStatus("demo", { root }).next_step, /kéo file use case/);
    fs.mkdirSync(p("features", "demo", "usecases"), { recursive: true });
    fs.writeFileSync(p("features", "demo", "usecases", "uc.md"), "# UC");
    assert.match(featureStatus("demo", { root }).next_step, /gen-testcases/);
    seedCases(CASE);
    assert.match(featureStatus("demo", { root }).next_step, /duyệt 1 test case draft/);
    seedCases({ ...CASE, status: "reviewed" });
    assert.match(featureStatus("demo", { root }).next_step, /run-testcase/);
    fs.writeFileSync(path.join(runDir(), "ai-run", "TC_DEMO_001.json"), JSON.stringify(AI_RUN));
    const st = featureStatus("demo", { root });
    assert.match(st.next_step, /xác nhận TC_DEMO_001/);
    assert.equal(st.latest_run, RUN);
    assert.equal(st.cases[0]!.ai_run!.verdict, "ĐẠT");
  });
});
