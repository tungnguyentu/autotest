import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeFeature, writeTestCases } from "../feature-store.ts";
import type { TestCase } from "../schemas.ts";
import { CONCLUSION_HEADING, CONCLUSION_PLACEHOLDER, buildSummaryText, parseSummary, writeSummary } from "../summary.ts";
import { parseFeature } from "../schemas.ts";
const FEATURE = {
  feature: "demo",
  service: "Demo",
  baseURL: "https://demo.example.com",
  viewport: { width: 1280, height: 720 },
  screens: { home: { path: "/", auth: true, mask: [], scale: 1, wait_for: [] } },
};

const CASE = {
  id: "TC_DEMO_001",
  title: "Đăng nhập đúng",
  preconditions: [],
  steps: ["Mở trang đăng nhập", "Nhập thông tin hợp lệ"],
  expected: ["Vào được trang chủ"],
  priority: "High",
  type: "positive",
  status: "draft",
};

let root: string;
let runDir: string;
const opts = () => ({ root, env: {} as NodeJS.ProcessEnv });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "summary-test-"));
  writeFeature(parseFeature(FEATURE), opts());
  writeTestCases("demo", [CASE as TestCase], opts());
  runDir = path.join(root, "evidence", "2026-10-07_demo");
  fs.mkdirSync(runDir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("summary.md", () => {
  it("sinh mới có frontmatter đúng schema, các mục theo mẫu và kết luận để trống", () => {
    const text = writeSummary("demo", runDir, {}, opts());
    const parsed = parseSummary(text);
    assert.equal(parsed.front?.feature, "demo");
    assert.equal(parsed.front?.date, "2026-10-07");
    assert.equal(parsed.front?.run, "2026-10-07_demo");
    assert.equal(parsed.front?.environment, "https://demo.example.com");
    for (const h of ["## Test case (AI đề xuất)", "## UI check (AI đề xuất)", "## Vấn đề kỹ thuật", CONCLUSION_HEADING]) {
      assert.ok(text.includes(h), h);
    }
    assert.ok(text.trimEnd().endsWith(CONCLUSION_PLACEHOLDER));
    assert.equal(parsed.conclusion, "");
    assert.ok(fs.existsSync(path.join(runDir, "summary.md")));
  });

  it("sinh lại giữ nguyên kết luận và frontmatter tester đã điền", () => {
    writeSummary("demo", runDir, { conclusion: "Đạt, chấp nhận phát hành.\nCòn lỗi nhỏ ở trang chủ.", tester: "Lan", build: "abc123" }, opts());
    const again = writeSummary("demo", runDir, {}, opts());
    const parsed = parseSummary(again);
    assert.equal(parsed.conclusion, "Đạt, chấp nhận phát hành.\nCòn lỗi nhỏ ở trang chủ.");
    assert.equal(parsed.front?.tester, "Lan");
    assert.equal(parsed.front?.build, "abc123");
  });

  it("đưa dữ liệu ai-run, ui-diff và file hỏng vào đúng mục", () => {
    fs.mkdirSync(path.join(runDir, "ai-run"));
    fs.writeFileSync(
      path.join(runDir, "ai-run", "TC_DEMO_001.json"),
      JSON.stringify({
        id: "TC_DEMO_001",
        feature: "demo",
        baseURL: "https://demo.example.com",
        viewport: { width: 1280, height: 720 },
        started_at: "2026-10-07T10:00:00+07:00",
        steps: [],
        ai_result: { verdict: "ĐẠT", per_expected: [] },
      }),
    );
    fs.writeFileSync(path.join(runDir, "ai-run", "BAD.json"), "{ không phải json");
    fs.mkdirSync(path.join(runDir, "ui-diff", "home"), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "ui-diff", "home", "metrics.json"),
      JSON.stringify({
        screen: "home",
        figma_size: [1280, 720],
        actual_size: [1280, 700],
        compared_size: [1280, 700],
        scale: 1,
        threshold: 16,
        diff_ratio: 0.02,
        regions: [],
        total_regions: 3,
        masked_boxes: 0,
        warnings: ["Kích thước lệch 20px"],
        note: "diff không phải kết luận",
      }),
    );
    const text = buildSummaryText("demo", runDir, {}, opts());
    assert.match(text, /\| TC_DEMO_001 \| Đăng nhập đúng \| ĐẠT \| chưa quyết \| chưa chạy \| ai-run\/TC_DEMO_001\.json \|/);
    assert.match(text, /\| home \| chưa đánh giá \(3 vùng pixel khác/);
    assert.match(text, /- ai-run\/BAD\.json không đọc được/);
    assert.match(text, /- home: Kích thước lệch 20px/);
  });

  it("bảng UI check lấy số sai khác theo mức từ report.md và báo screen chưa so được", () => {
    const dir = path.join(runDir, "ui-diff");
    fs.mkdirSync(path.join(dir, "home"), { recursive: true });
    fs.mkdirSync(path.join(dir, "about"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "home", "metrics.json"),
      JSON.stringify({ screen: "home", figma_size: [1, 1], actual_size: [1, 1], compared_size: [1, 1], scale: 1, threshold: 20, diff_ratio: 0, regions: [], total_regions: 0, masked_boxes: 0, warnings: [], note: "n" }),
    );
    fs.writeFileSync(
      path.join(dir, "home", "report.md"),
      "## Sai khác đề xuất\n\n| # | Vùng | Hạng mục | Figma | Thực tế | Mức | Phân loại |\n| --- | --- | --- | --- | --- | --- | --- |\n| 1 | region_01 | Màu | a | b | Cao | Sai khác thật |\n| 2 | region_02 | Màu | a | b | Thấp | Sai khác thật |\n| 3 | region_03 | Nội dung | a | b | - | Có thể chấp nhận |\n",
    );
    fs.writeFileSync(
      path.join(dir, "about", "meta.json"),
      JSON.stringify({ screen: "about", captured_at: "2026-10-07T10:00:00+07:00", viewport: { width: 1, height: 1 }, full_page: false, scale: 1, warnings: ["Thiếu ảnh Figma: features/demo/figma/about.png"] }),
    );
    const text = buildSummaryText("demo", runDir, {}, opts());
    assert.match(text, /\| home \| Cao 1 \/ TB 0 \/ Thấp 1, 1 mục chấp nhận hoặc cần xác nhận \| ui-diff\/home\/report\.md \|/);
    assert.match(text, /\| about \| chưa so được/);
    assert.match(text, /- about: Thiếu ảnh Figma/);
  });

  it("ghi quyết định của tester và kết quả Playwright vào bảng test case", () => {
    fs.mkdirSync(path.join(runDir, "ai-run"));
    fs.writeFileSync(
      path.join(runDir, "ai-run", "TC_DEMO_001.json"),
      JSON.stringify({
        id: "TC_DEMO_001",
        feature: "demo",
        baseURL: "https://demo.example.com",
        viewport: { width: 1, height: 1 },
        started_at: "2026-10-07T10:00:00+07:00",
        steps: [],
        ai_result: { verdict: "ĐẠT", per_expected: [] },
        tester: { decision: "confirmed", note: "", decided_at: "2026-10-07T11:00:00+07:00" },
      }),
    );
    fs.writeFileSync(
      path.join(runDir, "playwright-last.json"),
      JSON.stringify({
        feature: "demo",
        spec: null,
        exit_code: 0,
        stopped: false,
        started_at: "2026-10-07T11:00:00+07:00",
        finished_at: "2026-10-07T11:01:00+07:00",
        tests: [{ file: "TC_DEMO_001.spec.ts", title: "x", status: "passed", duration_ms: 5 }],
      }),
    );
    assert.match(buildSummaryText("demo", runDir, {}, opts()), /\| TC_DEMO_001 \| Đăng nhập đúng \| ĐẠT \| Đã xác nhận \| pass \|/);
  });

  it("thoát ký tự | và xuống dòng trong ô bảng", () => {
    writeTestCases("demo", [{ ...(CASE as TestCase), title: "a | b\nc" }], opts());
    fs.mkdirSync(path.join(runDir, "ai-run"));
    fs.writeFileSync(
      path.join(runDir, "ai-run", "TC_DEMO_001.json"),
      JSON.stringify({ id: "TC_DEMO_001", feature: "demo", baseURL: "https://demo.example.com", viewport: { width: 1, height: 1 }, started_at: "2026-10-07T10:00:00+07:00", steps: [] }),
    );
    assert.match(buildSummaryText("demo", runDir, {}, opts()), /\| TC_DEMO_001 \| a \\\| b c \| chưa đánh giá \|/);
  });

  it("tiêu đề Kết luận chỉ tính khi ở đầu dòng: chuỗi giống nằm giữa dòng bảng không cắt nhầm", () => {
    writeTestCases("demo", [{ ...(CASE as TestCase), title: `Xem ${CONCLUSION_HEADING} của tester` }], opts());
    const first = writeSummary("demo", runDir, { conclusion: "Kết luận thật" }, opts());
    assert.equal(parseSummary(first).conclusion, "Kết luận thật");
    // Sinh lại không nhân đôi hay làm hỏng nội dung.
    const second = writeSummary("demo", runDir, {}, opts());
    assert.equal(parseSummary(second).conclusion, "Kết luận thật");
    assert.equal(second.split("\n").filter((l) => l === CONCLUSION_HEADING).length, 1);
    assert.equal(parseSummary(`| a | b ${CONCLUSION_HEADING} c |\n`).conclusion, "");
  });

  it("không tạo thư mục đợt khi chưa có", () => {
    assert.throws(() => writeSummary("demo", path.join(root, "evidence", "2026-10-08_demo"), {}, opts()), /Không tìm thấy/);
    assert.ok(!fs.existsSync(path.join(root, "evidence", "2026-10-08_demo")));
  });
});
