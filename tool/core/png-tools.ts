import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

/** Ghép các ảnh cùng chiều rộng theo chiều dọc. */
export function stitchVertical(parts: PNG[]): PNG {
  const width = parts[0]?.width ?? 0;
  const out = new PNG({ width, height: parts.reduce((h, p) => h + p.height, 0) });
  let y = 0;
  for (const p of parts) {
    if (p.width !== width) throw new Error(`Ảnh ghép lệch chiều rộng: ${p.width} khác ${width}`);
    PNG.bitblt(p, out, 0, 0, p.width, p.height, 0, y);
    y += p.height;
  }
  return out;
}

/** Thu nhỏ ảnh theo hệ số `scale` (>= 1) bằng trung bình khối điểm ảnh, giữ chữ đọc được. */
export function downscale(src: PNG, scale: number): PNG {
  if (scale <= 1) return src;
  const w = Math.max(1, Math.floor(src.width / scale));
  const h = Math.max(1, Math.floor(src.height / scale));
  const out = new PNG({ width: w, height: h });
  for (let oy = 0; oy < h; oy++) {
    const y0 = Math.floor(oy * scale);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((oy + 1) * scale)));
    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.floor(ox * scale);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((ox + 1) * scale)));
      const sum = [0, 0, 0, 0];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * src.width + x) * 4;
          for (let k = 0; k < 4; k++) sum[k]! += src.data[i + k]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (oy * w + ox) * 4;
      for (let k = 0; k < 4; k++) out.data[o + k] = Math.round(sum[k]! / n);
    }
  }
  return out;
}

export interface SegmentOptions {
  /** Chiều rộng tối đa của ảnh ghép sau khi thu nhỏ. */
  maxWidth?: number;
  /** Chiều cao mỗi đoạn sau khi thu nhỏ. */
  segmentHeight?: number;
  gap?: number;
}

/**
 * Đặt hai ảnh toàn trang cạnh nhau (trái `left`, phải `right`), cắt thành từng đoạn theo chiều dọc,
 * thu nhỏ để công cụ đọc ảnh xem được. Ghi `<outDir>/<prefix>-NN.png`, trả về danh sách file.
 */
export function writeSideBySideSegments(left: PNG, right: PNG | null, outDir: string, prefix: string, opts: SegmentOptions = {}): string[] {
  const gap = right ? (opts.gap ?? 20) : 0;
  const fullW = left.width + (right ? right.width + gap : 0);
  const scale = Math.max(1, fullW / (opts.maxWidth ?? 1500));
  // Ảnh hẹp (mobile) cho đoạn cao hơn để bớt số file.
  const segH = Math.round((opts.segmentHeight ?? (fullW / scale < 1000 ? 1600 : 1000)) * scale);
  const height = Math.max(left.height, right?.height ?? 0);
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (let y = 0, i = 1; y < height; y += segH, i++) {
    const h = Math.min(segH, height - y);
    const seg = new PNG({ width: fullW, height: h });
    seg.data.fill(160);
    const blit = (src: PNG, dx: number) => {
      const sh = Math.min(h, src.height - y);
      if (sh > 0) PNG.bitblt(src, seg, 0, y, src.width, sh, dx, 0);
    };
    blit(left, 0);
    if (right) blit(right, left.width + gap);
    const file = path.join(outDir, `${prefix}-${String(i).padStart(2, "0")}.png`);
    fs.writeFileSync(file, PNG.sync.write(downscale(seg, scale)));
    files.push(file);
  }
  return files;
}

export const readPng = (file: string): PNG => PNG.sync.read(fs.readFileSync(file));
