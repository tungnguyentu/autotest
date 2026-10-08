import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PNG } from "pngjs";
import { compareDir, downscale, findRegions, toPixelmatchThreshold } from "../compare.ts";
import { parseMetrics } from "../../core/schemas.ts";

type Rect = { x: number; y: number; w: number; h: number; color: [number, number, number] };

function image(w: number, h: number, rects: Rect[] = [], bg: [number, number, number] = [255, 255, 255]): PNG {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = rects.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
      const c = r?.color ?? bg;
      const i = (y * w + x) * 4;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = 255;
    }
  }
  return png;
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "compare-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const save = (name: string, png: PNG) => fs.writeFileSync(path.join(dir, name), PNG.sync.write(png));
const meta = (extra: object = {}) =>
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify({ screen: "home", captured_at: "2026-10-07T10:00:00+07:00", viewport: { width: 200, height: 120 }, full_page: false, scale: 1, mask_boxes: [], warnings: [], ...extra }),
  );

const RED: [number, number, number] = [220, 30, 30];
const BLUE: [number, number, number] = [30, 30, 220];

describe("compare", () => {
  it("tìm đúng hai vùng khác, xếp theo số pixel giảm dần, ghi đủ file", () => {
    save("figma.png", image(200, 120));
    // Vùng lớn 40x30 tại (20,20), vùng nhỏ 20x20 tại (130,70).
    save("actual.png", image(200, 120, [{ x: 20, y: 20, w: 40, h: 30, color: RED }, { x: 130, y: 70, w: 20, h: 20, color: BLUE }]));
    meta();
    const m = compareDir({ dir });

    assert.equal(m.total_regions, 2);
    const [big, small] = m.regions;
    assert.ok(big && small);
    assert.equal(big.id, 1);
    assert.equal(big.changed_px, 1200);
    assert.ok(Math.abs(big.x - 20) <= 16 && Math.abs(big.y - 20) <= 16, `vị trí ${big.x},${big.y}`);
    assert.ok(big.w >= 40 && big.w <= 40 + 32 && big.h >= 30 && big.h <= 30 + 32, `kích thước ${big.w}x${big.h}`);
    assert.equal(small.id, 2);
    assert.equal(small.changed_px, 400);
    assert.ok(Math.abs(small.x - 130) <= 16 && Math.abs(small.y - 70) <= 16);
    assert.equal(m.diff_ratio, Math.round((1600 / (200 * 120)) * 1e5) / 1e5);
    assert.deepEqual(m.compared_size, [200, 120]);
    assert.deepEqual(m.warnings, []);

    for (const f of ["diff.png", "side_by_side.png", "metrics.json", "crops/region_01.png", "crops/region_02.png"]) {
      assert.ok(fs.existsSync(path.join(dir, f)), `thiếu ${f}`);
    }
    assert.equal(big.crop, "crops/region_01.png");
    assert.equal(PNG.sync.read(fs.readFileSync(path.join(dir, "side_by_side.png"))).width, 200 * 3 + 24);
    assert.deepEqual(parseMetrics(JSON.parse(fs.readFileSync(path.join(dir, "metrics.json"), "utf8"))).regions.length, 2);
  });

  it("hai ảnh giống nhau thì không có vùng nào", () => {
    save("figma.png", image(100, 60, [{ x: 10, y: 10, w: 30, h: 20, color: BLUE }]));
    save("actual.png", image(100, 60, [{ x: 10, y: 10, w: 30, h: 20, color: BLUE }]));
    const m = compareDir({ dir });
    assert.equal(m.total_regions, 0);
    assert.equal(m.diff_ratio, 0);
    assert.deepEqual(m.regions, []);
  });

  it("mask box làm mất vùng nằm trong nó, vùng còn lại giữ nguyên", () => {
    save("figma.png", image(200, 120));
    save("actual.png", image(200, 120, [{ x: 20, y: 20, w: 40, h: 30, color: RED }, { x: 130, y: 70, w: 20, h: 20, color: BLUE }]));
    meta({ mask_boxes: [{ selector: ".clock", x: 10, y: 10, width: 70, height: 50 }] });
    const m = compareDir({ dir });
    assert.equal(m.total_regions, 1);
    assert.equal(m.masked_boxes, 1);
    assert.equal(m.regions[0]?.changed_px, 400);
  });

  it("lệch kích thước: so phần chồng lên nhau và cảnh báo, lệch rộng trên 2px có cảnh báo thứ hai", () => {
    save("figma.png", image(200, 120));
    save("actual.png", image(190, 150, [{ x: 20, y: 20, w: 40, h: 30, color: RED }]));
    const m = compareDir({ dir });
    assert.deepEqual(m.compared_size, [190, 120]);
    assert.deepEqual(m.figma_size, [200, 120]);
    assert.deepEqual(m.actual_size, [190, 150]);
    assert.ok(m.warnings.some((w) => w.startsWith("Kích thước khác nhau")));
    assert.ok(m.warnings.some((w) => w.includes("Chiều rộng lệch > 2px")));

    save("actual.png", image(201, 121));
    const near = compareDir({ dir });
    assert.ok(near.warnings.some((w) => w.startsWith("Kích thước khác nhau")));
    assert.ok(!near.warnings.some((w) => w.includes("Chiều rộng lệch")));
  });

  it("scale 2: thu ảnh Figma về cỡ viewport rồi so", () => {
    const big = image(400, 240, [{ x: 40, y: 40, w: 80, h: 60, color: RED }]);
    save("figma.png", big);
    save("actual.png", image(200, 120, [{ x: 20, y: 20, w: 40, h: 30, color: RED }]));
    meta({ scale: 2 });
    const m = compareDir({ dir });
    assert.deepEqual(m.figma_size, [200, 120]);
    assert.equal(m.scale, 2);
    assert.equal(m.total_regions, 0);
  });

  it("thiếu figma.png thì báo lỗi rõ", () => {
    save("actual.png", image(10, 10));
    assert.throws(() => compareDir({ dir }), /Thiếu figma\.png/);
  });

  it("tham số sai bị từ chối", () => {
    save("figma.png", image(10, 10));
    save("actual.png", image(10, 10));
    assert.throws(() => compareDir({ dir, threshold: 300 }), /--threshold/);
    assert.throws(() => compareDir({ dir, scale: 0 }), /--scale/);
  });

  it("chỉ giữ maxRegions vùng lớn nhất và cảnh báo", () => {
    save("figma.png", image(200, 120));
    save("actual.png", image(200, 120, [{ x: 20, y: 20, w: 40, h: 30, color: RED }, { x: 130, y: 70, w: 20, h: 20, color: BLUE }]));
    const m = compareDir({ dir, maxRegions: 1 });
    assert.equal(m.regions.length, 1);
    assert.equal(m.total_regions, 2);
    assert.ok(m.warnings.some((w) => w.includes("chỉ xuất 1 vùng")));
  });
});

describe("findRegions", () => {
  it("gộp ô kề nhau theo 8 hướng, bỏ ô dưới ngưỡng", () => {
    const w = 64;
    const h = 64;
    const mask = new Uint8Array(w * h);
    const fill = (x0: number, y0: number, s: number) => {
      for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) mask[y * w + x] = 1;
    };
    fill(0, 0, 16); // ô (0,0)
    fill(16, 16, 16); // ô (1,1): chéo với ô trên, cùng vùng
    mask[50 * w + 50] = 1; // 1 pixel: dưới ngưỡng 3% của ô 16x16
    const { regions, total } = findRegions(mask, w, h, 16, 0.03, 15);
    assert.equal(total, 1);
    assert.deepEqual(regions[0], { id: 1, x: 0, y: 0, w: 32, h: 32, changed_px: 512 });
  });
});

describe("downscale và threshold", () => {
  it("trung bình ô khi chia 2", () => {
    const src = image(4, 2, [{ x: 0, y: 0, w: 1, h: 2, color: [0, 0, 0] }]); // cột 0 đen, còn lại trắng
    const out = downscale(src, 2);
    assert.equal(out.width, 2);
    assert.equal(out.height, 1);
    assert.equal(out.data[0], 128); // (0 + 255) / 2 làm tròn
    assert.equal(out.data[4], 255);
  });

  it("đổi threshold 0-255 sang 0-1", () => {
    assert.equal(toPixelmatchThreshold(255), 1);
    assert.equal(toPixelmatchThreshold(0), 0);
  });
});
