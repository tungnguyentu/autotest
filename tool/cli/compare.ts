import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { writeJsonAtomic } from "../core/feature-store.ts";
import { parseMeta, type MaskBox, type Metrics } from "../core/schemas.ts";

export interface CompareOptions {
  /** Thư mục screen chứa figma.png, actual.png (và meta.json nếu có). */
  dir: string;
  /** Tỉ lệ export của ảnh Figma. Bỏ trống thì đọc meta.json, mặc định 1. */
  scale?: number;
  /** Chênh lệch màu coi là giống, thang 0-255 (xem `toPixelmatchThreshold`). */
  threshold?: number;
  cell?: number;
  cellRatio?: number;
  maxRegions?: number;
  pad?: number;
}

export interface Region {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  changed_px: number;
  crop?: string;
}

const RED: [number, number, number] = [230, 40, 40];
const GREY: [number, number, number] = [120, 120, 120];
const WHITE: [number, number, number] = [255, 255, 255];
const GAP = 12;
export const NOTE = "Pixel diff chỉ để khoanh vùng; không dùng làm kết luận PASS/FAIL.";

/**
 * `compare.py` so theo "chênh lệch lớn nhất của một kênh màu (0-255) > threshold". pixelmatch dùng khoảng cách
 * màu OKLab (1 là chênh lệch giữa đen và trắng), nên không có phép đổi chính xác giữa hai thang.
 * Quy ước: pixelmatch threshold = threshold / 255, tức 20 thành khoảng 0.078, gần mặc định 0.1 của pixelmatch.
 * Cần nhạy hơn thì giảm `--threshold`, bớt nhạy thì tăng.
 */
export const toPixelmatchThreshold = (threshold: number): number => threshold / 255;

// ---------- ảnh ----------

function readPng(file: string): PNG {
  if (!fs.existsSync(file)) throw new Error(`Thiếu ${path.basename(file)} trong ${path.dirname(file)}`);
  let png: PNG;
  try {
    png = PNG.sync.read(fs.readFileSync(file));
  } catch (err) {
    throw new Error(`${path.basename(file)} không phải PNG hợp lệ: ${(err as Error).message}`);
  }
  // Ảnh có kênh alpha (Figma export nền trong suốt) được đặt lên nền trắng trước khi so.
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = (d[i + 3] ?? 255) / 255;
    if (a === 1) continue;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round((d[i + c] ?? 0) * a + 255 * (1 - a));
    d[i + 3] = 255;
  }
  return png;
}

function blank(width: number, height: number, color: [number, number, number] = WHITE): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = color[0];
    png.data[i + 1] = color[1];
    png.data[i + 2] = color[2];
    png.data[i + 3] = 255;
  }
  return png;
}

/** Cắt `png` về góc trên trái kích thước w x h. */
function cropTo(png: PNG, w: number, h: number): PNG {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, 0, 0, w, h, 0, 0);
  return out;
}

/** Thu nhỏ bằng trung bình các pixel nguồn trong từng ô đích (không thêm thư viện ảnh). */
export function downscale(src: PNG, scale: number): PNG {
  const w = Math.max(1, Math.round(src.width / scale));
  const h = Math.max(1, Math.round(src.height / scale));
  const out = new PNG({ width: w, height: h });
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.min(src.height - 1, Math.floor(y * sy));
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(src.width - 1, Math.floor(x * sx));
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i] ?? 0;
          g += src.data[i + 1] ?? 0;
          b += src.data[i + 2] ?? 0;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * w + x) * 4;
      out.data[o] = Math.round(r / n);
      out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

// ---------- vẽ ----------

function setPx(png: PNG, x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = 255;
}

function fillRect(png: PNG, x: number, y: number, w: number, h: number, c: [number, number, number]): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(png, xx, yy, c);
}

function strokeRect(png: PNG, x: number, y: number, w: number, h: number, c: [number, number, number], width: number): void {
  fillRect(png, x, y, w, width, c);
  fillRect(png, x, y + h - width, w, width, c);
  fillRect(png, x, y, width, h, c);
  fillRect(png, x + w - width, y, width, h, c);
}

// Font bitmap 3x5 cho chữ số, đủ để đánh số vùng trên diff.png mà không cần thư viện chữ.
const DIGITS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};
const DIGIT_SCALE = 2;
const LABEL_H = 14;
const labelWidth = (text: string) => text.length * (3 * DIGIT_SCALE + 2) + 4;

function drawLabel(png: PNG, x: number, y: number, text: string): void {
  fillRect(png, x, y, labelWidth(text), LABEL_H, RED);
  let cx = x + 3;
  for (const ch of text) {
    const rows = DIGITS[ch] ?? [];
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit === "1") fillRect(png, cx + rx * DIGIT_SCALE, y + 2 + ry * DIGIT_SCALE, DIGIT_SCALE, DIGIT_SCALE, WHITE);
      });
    });
    cx += 3 * DIGIT_SCALE + 2;
  }
}

// ---------- gộp vùng ----------

/**
 * Gộp các ô lưới (cell x cell) có tỉ lệ pixel khác > minRatio thành vùng liên thông 8 hướng.
 * Giữ đúng thuật toán `find_regions` của bản Python: ô ở mép vẫn chia cho cell*cell.
 * Trả về tối đa maxRegions vùng lớn nhất (theo changed_px) và tổng số vùng tìm thấy.
 */
export function findRegions(
  mask: Uint8Array,
  w: number,
  h: number,
  cell: number,
  minRatio: number,
  maxRegions: number,
): { regions: Region[]; total: number } {
  const gh = Math.ceil(h / cell);
  const gw = Math.ceil(w / cell);
  const hot = new Uint8Array(gh * gw);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      for (let y = gy * cell; y < Math.min(h, (gy + 1) * cell); y++) {
        for (let x = gx * cell; x < Math.min(w, (gx + 1) * cell); x++) sum += mask[y * w + x] ?? 0;
      }
      if (sum / (cell * cell) > minRatio) hot[gy * gw + gx] = 1;
    }
  }

  const seen = new Uint8Array(gh * gw);
  const found: Omit<Region, "id">[] = [];
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (!hot[gy * gw + gx] || seen[gy * gw + gx]) continue;
      const queue: [number, number][] = [[gy, gx]];
      seen[gy * gw + gx] = 1;
      let minY = gy;
      let maxY = gy;
      let minX = gx;
      let maxX = gx;
      for (let head = 0; head < queue.length; head++) {
        const [y, x] = queue[head]!;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || nx < 0 || ny >= gh || nx >= gw) continue;
            const k = ny * gw + nx;
            if (hot[k] && !seen[k]) {
              seen[k] = 1;
              queue.push([ny, nx]);
            }
          }
        }
      }
      const x0 = minX * cell;
      const y0 = minY * cell;
      const x1 = Math.min((maxX + 1) * cell, w);
      const y1 = Math.min((maxY + 1) * cell, h);
      let changed = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) changed += mask[y * w + x] ?? 0;
      found.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, changed_px: changed });
    }
  }
  found.sort((a, b) => b.changed_px - a.changed_px); // sort ổn định: hòa thì giữ thứ tự quét
  return { regions: found.slice(0, maxRegions).map((r, i) => ({ id: i + 1, ...r })), total: found.length };
}

// ---------- so ảnh ----------

function readMeta(dir: string) {
  const file = path.join(dir, "meta.json");
  if (!fs.existsSync(file)) return null;
  try {
    return parseMeta(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (err) {
    throw new Error(`meta.json không đọc được: ${(err as Error).message.split("\n")[0]}`);
  }
}

/** Mảng 1 byte/pixel, khác 0 ở những pixel nằm trong mask box (pixelmatch bỏ qua các pixel này). */
function maskBoxesToIgnore(boxes: MaskBox[], w: number, h: number): Uint8Array {
  const ignore = new Uint8Array(w * h);
  for (const b of boxes) {
    for (let y = Math.max(0, b.y); y < Math.min(h, b.y + b.height); y++) {
      for (let x = Math.max(0, b.x); x < Math.min(w, b.x + b.width); x++) ignore[y * w + x] = 1;
    }
  }
  return ignore;
}

/** So `figma.png` với `actual.png` trong `dir`, ghi diff.png, side_by_side.png, crops/ và metrics.json. */
export function compareDir(options: CompareOptions): Metrics {
  const { dir } = options;
  const threshold = options.threshold ?? 20;
  const cell = options.cell ?? 16;
  const cellRatio = options.cellRatio ?? 0.03;
  const maxRegions = options.maxRegions ?? 15;
  const pad = options.pad ?? 16;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) throw new Error("--threshold phải là số nguyên từ 0 đến 255.");
  if (!Number.isInteger(cell) || cell < 1) throw new Error("--cell phải là số nguyên dương.");
  if (!(cellRatio >= 0 && cellRatio < 1)) throw new Error("--cell-ratio phải từ 0 đến dưới 1.");
  if (!Number.isInteger(maxRegions) || maxRegions < 1) throw new Error("--max-regions phải là số nguyên dương.");
  if (!Number.isInteger(pad) || pad < 0) throw new Error("--pad phải là số nguyên không âm.");

  const meta = readMeta(dir);
  const scale = options.scale ?? meta?.scale ?? 1;
  if (!(scale > 0)) throw new Error("--scale phải lớn hơn 0.");
  const warnings: string[] = [...(meta?.warnings ?? [])];

  let figma = readPng(path.join(dir, "figma.png"));
  const actual = readPng(path.join(dir, "actual.png"));
  if (scale !== 1) figma = downscale(figma, scale);

  if (figma.width !== actual.width || figma.height !== actual.height) {
    warnings.push(
      `Kích thước khác nhau: Figma ${figma.width}x${figma.height}, thực tế ${actual.width}x${actual.height}. Chỉ so phần chồng lên nhau.`,
    );
    if (Math.abs(figma.width - actual.width) > 2) {
      warnings.push("Chiều rộng lệch > 2px: kiểm tra lại viewport hoặc tỉ lệ export (scale).");
    }
  }
  const w = Math.min(figma.width, actual.width);
  const h = Math.min(figma.height, actual.height);
  if (w < 1 || h < 1) throw new Error("Ảnh rỗng, không có phần nào để so.");
  const figmaC = cropTo(figma, w, h);
  const actualC = cropTo(actual, w, h);

  const boxes = meta?.mask_boxes ?? [];
  // Pixel khác được pixelmatch vẽ lên `out` (diffMask: chỉ vẽ pixel khác, alpha 255; pixel chống răng cưa bị bỏ qua).
  const out = new Uint8Array(w * h * 4);
  pixelmatch(figmaC.data, actualC.data, out, w, h, {
    threshold: toPixelmatchThreshold(threshold),
    diffMask: true,
    ignoreMask: maskBoxesToIgnore(boxes, w, h),
  });
  const mask = new Uint8Array(w * h);
  let changedTotal = 0;
  for (let i = 0; i < mask.length; i++) {
    if ((out[i * 4 + 3] ?? 0) !== 0) {
      mask[i] = 1;
      changedTotal++;
    }
  }

  const { regions, total } = findRegions(mask, w, h, cell, cellRatio, maxRegions);
  if (total > regions.length) warnings.push(`Có ${total} vùng khác, chỉ xuất ${regions.length} vùng lớn nhất.`);

  // diff.png: ảnh thực tế làm mờ xám, pixel khác tô đỏ, mask box viền xám, vùng có khung đỏ và số.
  const diff = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (mask[i]) {
      diff.data[o] = RED[0];
      diff.data[o + 1] = RED[1];
      diff.data[o + 2] = RED[2];
    } else {
      const gray = ((actualC.data[o] ?? 0) * 299 + (actualC.data[o + 1] ?? 0) * 587 + (actualC.data[o + 2] ?? 0) * 114) / 1000;
      const v = Math.round(gray * 0.45 + 255 * 0.55);
      diff.data[o] = v;
      diff.data[o + 1] = v;
      diff.data[o + 2] = v;
    }
    diff.data[o + 3] = 255;
  }
  for (const b of boxes) strokeRect(diff, b.x, b.y, b.width, b.height, GREY, 1);
  for (const r of regions) {
    strokeRect(diff, r.x, r.y, r.w, r.h, RED, 2);
    drawLabel(diff, r.x, Math.max(0, r.y - LABEL_H), String(r.id));
  }
  fs.writeFileSync(path.join(dir, "diff.png"), PNG.sync.write(diff));

  const sbs = blank(w * 3 + GAP * 2, h);
  [figmaC, actualC, diff].forEach((im, i) => PNG.bitblt(im, sbs, 0, 0, w, h, i * (w + GAP), 0));
  fs.writeFileSync(path.join(dir, "side_by_side.png"), PNG.sync.write(sbs));

  const cropsDir = path.join(dir, "crops");
  fs.rmSync(cropsDir, { recursive: true, force: true }); // crop của lần so trước không được lẫn vào lần này
  fs.mkdirSync(cropsDir, { recursive: true });
  for (const r of regions) {
    const x0 = Math.max(0, r.x - pad);
    const y0 = Math.max(0, r.y - pad);
    const x1 = Math.min(w, r.x + r.w + pad);
    const y1 = Math.min(h, r.y + r.h + pad);
    const cw = x1 - x0;
    const ch = y1 - y0;
    const pair = blank(cw * 2 + GAP, ch);
    PNG.bitblt(figmaC, pair, x0, y0, cw, ch, 0, 0);
    PNG.bitblt(actualC, pair, x0, y0, cw, ch, cw + GAP, 0);
    const name = `region_${String(r.id).padStart(2, "0")}.png`;
    fs.writeFileSync(path.join(cropsDir, name), PNG.sync.write(pair));
    r.crop = `crops/${name}`;
  }

  const metrics: Metrics = {
    screen: meta?.screen ?? path.basename(dir),
    figma_size: [figma.width, figma.height],
    actual_size: [actual.width, actual.height],
    compared_size: [w, h],
    scale,
    threshold,
    diff_ratio: Math.round((changedTotal / (w * h)) * 1e5) / 1e5,
    regions,
    total_regions: total,
    masked_boxes: boxes.length,
    warnings,
    note: NOTE,
  };
  writeJsonAtomic(path.join(dir, "metrics.json"), metrics);
  return metrics;
}
