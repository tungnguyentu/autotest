import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { PROJECT_ROOT } from "../paths.ts";
import {
  SchemaError,
  parseAiRun,
  parseFeature,
  parseMetrics,
  parseSummaryFrontmatter,
  parseTestCases,
} from "../schemas.ts";

const feature = {
  feature: "staging",
  service: "Staging",
  baseURL: "https://staging.example.com",
  viewport: { width: 1440, height: 900 },
  screens: { home: { path: "/", auth: true } },
};

const testcase = {
  id: "TC_STAGING_001",
  title: "Mở trang chủ",
  screen: "home",
  preconditions: [],
  steps: ["Mở /"],
  expected: ["Thấy trang chủ"],
  priority: "High",
  type: "positive",
  status: "draft",
};

const aiRun = {
  id: "TC_STAGING_001",
  feature: "staging",
  baseURL: "https://staging.example.com",
  viewport: { width: 1440, height: 900 },
  started_at: "2026-10-07T15:00:00+07:00",
  steps: [
    {
      n: 1,
      action: "fill",
      target: { role: "textbox", name: "Email", label: null, placeholder: null, css: null },
      value: "<secret:USER_EMAIL>",
      url_before: "https://staging.example.com/login",
      url_after: "https://staging.example.com/login",
      screenshot: "screenshots/TC_STAGING_001/01.png",
      note: "",
    },
  ],
  ai_result: {
    verdict: "ĐẠT",
    per_expected: [{ expected: "Thấy trang chủ", verdict: "ĐẠT", observation: "URL cuối là /" }],
  },
  tester: { decision: null, note: "", decided_at: null },
};

const metrics = {
  screen: "home",
  figma_size: [1440, 900],
  actual_size: [1440, 900],
  compared_size: [1440, 900],
  scale: 1,
  threshold: 20,
  diff_ratio: 0.012,
  regions: [{ id: 1, x: 0, y: 0, w: 32, h: 16, changed_px: 120, crop: "crops/region_01.png" }],
  total_regions: 1,
  masked_boxes: 0,
  warnings: [],
  note: "Pixel diff chỉ để khoanh vùng; không dùng làm kết luận PASS/FAIL.",
};

describe("feature.json", () => {
  it("nhận mẫu hợp lệ và điền giá trị mặc định cho screen", () => {
    const f = parseFeature(feature);
    assert.deepEqual(f.screens.home, { path: "/", auth: true, mask: [], scale: 1, wait_for: [] });
  });
  it("nhận file features/staging/feature.json của project", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "features/staging/feature.json"), "utf8"));
    assert.equal(parseFeature(raw).feature, "staging");
  });
  it("từ chối baseURL sai, path thiếu dấu /, viewport âm", () => {
    assert.throws(() => parseFeature({ ...feature, baseURL: "not a url" }), SchemaError);
    assert.throws(() => parseFeature({ ...feature, feature: "staging_r2" }), SchemaError); // trùng tên đợt vòng 2 của "staging"
    assert.equal(parseFeature({ ...feature, feature: "staging_r" }).feature, "staging_r");
    assert.throws(() => parseFeature({ ...feature, screens: { home: { path: "home" } } }), SchemaError);
    assert.throws(() => parseFeature({ ...feature, viewport: { width: -1, height: 900 } }), SchemaError);
  });
  it("từ chối tên tính năng có ký tự thoát thư mục", () => {
    assert.throws(() => parseFeature({ ...feature, feature: "../x" }), SchemaError);
  });
});

describe("testcases.json", () => {
  it("nhận mẫu hợp lệ, trường tùy chọn manual và tester_note", () => {
    const list = parseTestCases([testcase, { ...testcase, id: "TC_STAGING_002", manual: true, tester_note: "OTP" }]);
    assert.equal(list.length, 2);
  });
  it("từ chối status lạ, id trùng, steps rỗng", () => {
    assert.throws(() => parseTestCases([{ ...testcase, status: "done" }]), SchemaError);
    assert.throws(() => parseTestCases([testcase, testcase]), /trùng/);
    assert.throws(() => parseTestCases([{ ...testcase, steps: [] }]), SchemaError);
  });
});

describe("ai-run/<id>.json", () => {
  it("nhận mẫu hợp lệ", () => {
    const run = parseAiRun(aiRun);
    assert.equal(run.steps[0]?.value, "<secret:USER_EMAIL>");
  });
  it("cho phép chưa có ai_result và điền mặc định cho tester", () => {
    const { ai_result: _omit, tester: _t, ...rest } = aiRun;
    const run = parseAiRun(rest);
    assert.equal(run.ai_result, null);
    assert.equal(run.tester.decision, null);
  });
  it("từ chối action lạ, verdict lạ, thời gian thiếu múi giờ", () => {
    const bad = structuredClone(aiRun) as typeof aiRun;
    assert.throws(() => parseAiRun({ ...bad, steps: [{ ...bad.steps[0], action: "hover" }] }), SchemaError);
    assert.throws(() => parseAiRun({ ...bad, ai_result: { verdict: "PASS", per_expected: [] } }), SchemaError);
    assert.throws(() => parseAiRun({ ...bad, started_at: "2026-10-07T15:00:00" }), SchemaError);
  });
});

describe("metrics.json", () => {
  it("nhận mẫu hợp lệ", () => {
    assert.equal(parseMetrics(metrics).total_regions, 1);
  });
  it("từ chối diff_ratio ngoài 0..1 và cặp kích thước sai", () => {
    assert.throws(() => parseMetrics({ ...metrics, diff_ratio: 2 }), SchemaError);
    assert.throws(() => parseMetrics({ ...metrics, figma_size: [1440] }), SchemaError);
  });
});

describe("summary.md frontmatter", () => {
  it("nhận mẫu hợp lệ", () => {
    const s = parseSummaryFrontmatter({ feature: "staging", date: "2026-10-07", run: "2026-10-07_staging" });
    assert.equal(s.tester, "");
  });
  it("từ chối ngày sai định dạng", () => {
    assert.throws(
      () => parseSummaryFrontmatter({ feature: "staging", date: "07/10/2026", run: "x" }),
      SchemaError,
    );
  });
});

describe("SchemaError", () => {
  it("thông báo nêu rõ trường lỗi", () => {
    try {
      parseFeature({ ...feature, baseURL: "nope" });
      assert.fail("phải ném lỗi");
    } catch (err) {
      assert.match((err as Error).message, /baseURL/);
    }
  });
});
