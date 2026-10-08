import fs from "node:fs";
import path from "node:path";
import { localIso } from "./paths.ts";

/** Mọi file dưới `dir`, đường dẫn tương đối với `dir`. Thư mục không tồn tại thì trả mảng rỗng. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (cur: string) => {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Sao `shotsDir` sang `<backupRoot>/<timestamp>/` trước khi chạy `--update-snapshots`.
 * Trả về thư mục sao, hoặc null khi chưa có ảnh nào để sao.
 */
export function backupBaselines(shotsDir: string, backupRoot: string): string | null {
  const files = listFiles(shotsDir);
  if (!files.length) return null;
  const stamp = localIso().replace(/[:+]/g, "-");
  let dest = path.join(backupRoot, stamp);
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(backupRoot, `${stamp}-${n}`);
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.copyFileSync(path.join(shotsDir, rel), path.join(dest, rel));
  }
  return dest;
}

/**
 * Sau `--update-snapshots`: mọi ảnh trừ `keepRel` về đúng nội dung trước lần chạy (`keepRel` null: khôi phục tất cả,
 * dùng khi lần chạy lỗi).
 * Ảnh trong bản sao được chép lại, ảnh mới do lần chạy tạo ra (không có trong bản sao) bị xóa,
 * vì baseline của screen khác chưa được tester duyệt. Trả về các file đã khôi phục hoặc xóa.
 */
export function restoreOtherBaselines(shotsDir: string, backupDir: string | null, keepRel: string | null): string[] {
  const touched: string[] = [];
  const before = new Set(backupDir ? listFiles(backupDir) : []);
  for (const rel of listFiles(shotsDir)) {
    if (rel === keepRel || before.has(rel)) continue;
    fs.rmSync(path.join(shotsDir, rel), { force: true });
    touched.push(rel);
  }
  for (const rel of before) {
    if (rel === keepRel) continue;
    const src = path.join(backupDir!, rel);
    const dest = path.join(shotsDir, rel);
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(src))) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    touched.push(rel);
  }
  return touched;
}
