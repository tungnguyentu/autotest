import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { SchemaError, parseBaseline, parseDecisions, parseMeta } from "../schemas.ts";
import { countByLevel, describeLevels, findScreenshotSpec, parseReportRows } from "../ui-diff-store.ts";

const REPORT = `# UI check - home

## Sai khác đề xuất

| # | Vùng | Hạng mục | Figma | Thực tế | Mức | Phân loại |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | region_01 | Kích thước | Nút cao ~48px | ~40px | Trung bình | Sai khác thật |
| 2 | region_02 | Nội dung | "A \\| B" | "A" | Cao | Sai khác thật |
| 3 | region_03 | Màu | Xanh | Xanh nhạt | Thấp | Sai khác thật |
| 4 | region_04 | Nội dung | Tên mẫu | Tên test | - | Có thể chấp nhận |

Mức: Cao · Trung bình · Thấp

## Đã kiểm tra
| a | b |
`;

describe("parseReportRows", () => {
  it("đọc bảng theo tên cột, bỏ dòng phân cách, giữ ký tự | đã escape", () => {
    const rows = parseReportRows(REPORT);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[1], { index: 2, region: "region_02", item: "Nội dung", figma: '"A | B"', actual: '"A"', level: "Cao", kind: "Sai khác thật" });
    assert.equal(rows[3]?.kind, "Có thể chấp nhận");
  });

  it("không có mục hoặc không có bảng thì trả mảng rỗng", () => {
    assert.deepEqual(parseReportRows("# UI check\n\nChưa có gì"), []);
    assert.deepEqual(parseReportRows("## Sai khác đề xuất\n\nKhông có sai khác.\n"), []);
  });

  it("đếm theo mức chỉ với dòng Sai khác thật", () => {
    const c = countByLevel(parseReportRows(REPORT));
    assert.deepEqual(c, { high: 1, medium: 1, low: 1, other: 1 });
    assert.equal(describeLevels(c), "Cao 1 / TB 1 / Thấp 1, 1 mục chấp nhận hoặc cần xác nhận");
    assert.equal(describeLevels({ high: 0, medium: 0, low: 0, other: 0 }), "Cao 0 / TB 0 / Thấp 0");
  });
});

describe("findScreenshotSpec", () => {
  let root: string;
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ui-store-"));
    fs.mkdirSync(path.join(root, "tests", "demo"), { recursive: true });
    fs.writeFileSync(path.join(root, "tests", "demo", "A.spec.ts"), `await expect(page).toHaveScreenshot("about.png");`);
    fs.writeFileSync(path.join(root, "tests", "demo", "B.spec.ts"), "await expect(page).toHaveScreenshot(\n  `home.png`, { mask: [] });");
    fs.writeFileSync(path.join(root, "tests", "demo", "notes.txt"), `toHaveScreenshot('legacy.png')`);
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  it("tìm spec theo tên ảnh, chấp nhận ba loại nháy, bỏ qua file không phải spec", () => {
    assert.equal(findScreenshotSpec("demo", "home", { root }), "tests/demo/B.spec.ts");
    assert.equal(findScreenshotSpec("demo", "about", { root }), "tests/demo/A.spec.ts");
    assert.equal(findScreenshotSpec("demo", "legacy", { root }), null);
    assert.equal(findScreenshotSpec("demo", "ho.e", { root }), null); // dấu chấm không phải ký tự đại diện
    assert.equal(findScreenshotSpec("ghost", "home", { root }), null);
  });
});

describe("schema meta, decisions, baseline", () => {
  it("chấp nhận dữ liệu hợp lệ và điền mặc định", () => {
    const meta = parseMeta({ screen: "home", captured_at: "2026-10-07T10:00:00+07:00", viewport: { width: 10, height: 10 }, full_page: false, scale: 1 });
    assert.deepEqual(meta.mask_boxes, []);
    assert.deepEqual(meta.warnings, []);
    assert.equal(parseDecisions({ items: [{ index: 1, decision: "bug" }], decided_at: "2026-10-07T10:00:00+07:00" }).items[0]?.note, "");
    assert.equal(parseBaseline({ created_at: "2026-10-07T10:00:00+07:00", figma_modified: null, spec: "a", screenshot: "b", run: "r" }).tester, "");
  });

  it("từ chối quyết định lạ và chỉ số sai", () => {
    assert.throws(() => parseDecisions({ items: [{ index: 0, decision: "bug" }], decided_at: "2026-10-07T10:00:00+07:00" }), SchemaError);
    assert.throws(() => parseDecisions({ items: [{ index: 1, decision: "xong" }], decided_at: "2026-10-07T10:00:00+07:00" }), SchemaError);
    assert.throws(() => parseMeta({ screen: "home" }), SchemaError);
  });
});
