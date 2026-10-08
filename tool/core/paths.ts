import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Gốc project (thư mục chứa package.json). */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Đường dẫn (so với gốc project) chứa credential hoặc phiên đăng nhập.
 * Không sao chép, không in nội dung, không đưa vào report.
 */
export const SENSITIVE_PATHS = ["features/*/.env", "auth/"] as const;

const FEATURE_NAME = /^[a-z0-9][a-z0-9_-]*$/i;
/** Hậu tố của tên đợt vòng N. Tên tính năng kết thúc như vậy sẽ va chạm với đợt của tính năng khác. */
export const ROUND_SUFFIX = /_r\d+$/i;

/** True nếu `feature` là tên tính năng dùng được. Dùng chung cho `assertFeatureName` và schema. */
export const isFeatureName = (feature: string): boolean => FEATURE_NAME.test(feature) && !ROUND_SUFFIX.test(feature);

export function assertFeatureName(feature: string): string {
  if (!FEATURE_NAME.test(feature)) {
    throw new Error(`Tên tính năng không hợp lệ: "${feature}". Chỉ dùng chữ, số, "-" và "_".`);
  }
  if (ROUND_SUFFIX.test(feature)) {
    throw new Error(`Tên tính năng không hợp lệ: "${feature}". Không được kết thúc bằng "_r<số>" (trùng với tên đợt vòng N).`);
  }
  return feature;
}

/** True nếu đường dẫn tương đối (so với gốc project) nằm trong danh sách không sao chép, không in. */
export function isSensitivePath(relPath: string): boolean {
  const p = relPath.split(path.sep).join("/").replace(/^\.\//, "");
  return p === "auth" || p.startsWith("auth/") || /^features\/[^/]+\/\.env(\.[^/]*)?$/.test(p);
}

/**
 * Chuẩn hóa đường dẫn người dùng đưa vào: phải nằm trong một trong `allowedRoots` (sau khi theo symlink)
 * và không phải đường dẫn nhạy cảm (`.env`, `auth/`). Trả về đường dẫn tuyệt đối đã resolve.
 * `label` là tên tham số dùng trong thông báo lỗi.
 */
export function resolveUserPath(input: string, label: string, allowedRoots: string[], opts?: PathOptions & { where?: string }): string {
  const root = opts?.root ?? PROJECT_ROOT;
  const abs = path.resolve(root, input);
  const real = realpathLoose(abs);
  const inside = (base: string) => {
    const rel = path.relative(realpathLoose(base), real);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  if (!allowedRoots.some(inside)) {
    throw new Error(`${label} phải nằm trong ${opts?.where ?? allowedRoots.join(" hoặc ")}: ${input}`);
  }
  const relToRoot = path.relative(realpathLoose(root), real);
  if (!relToRoot.startsWith("..") && (isSensitivePath(relToRoot) || isSensitivePath(path.relative(root, abs)))) {
    throw new Error(`${label} trỏ vào đường dẫn nhạy cảm (credential hoặc phiên đăng nhập), không đọc: ${input}`);
  }
  return abs;
}

/** realpath của phần đã tồn tại, nối phần còn lại. Dùng cho đường dẫn chưa được tạo. */
function realpathLoose(p: string): string {
  const rest: string[] = [];
  let cur = path.resolve(p);
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...rest.reverse());
    } catch (err) {
      const parent = path.dirname(cur);
      if ((err as NodeJS.ErrnoException).code !== "ENOENT" || parent === cur) throw err;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

/** Origin cộng pathname của một URL, bỏ query và fragment (có thể chứa token). Không phải URL thì trả chuỗi rỗng. */
export function publicUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin === "null" ? `${u.protocol}${u.pathname}` : `${u.origin}${u.pathname}`;
  } catch {
    return "";
  }
}

export interface PathOptions {
  root?: string;
}

function rootOf(opts?: PathOptions): string {
  return opts?.root ?? PROJECT_ROOT;
}

export const featuresDir = (o?: PathOptions) => path.join(rootOf(o), "features");
export const featureDir = (f: string, o?: PathOptions) => path.join(featuresDir(o), assertFeatureName(f));
export const featureFile = (f: string, o?: PathOptions) => path.join(featureDir(f, o), "feature.json");
export const testcasesFile = (f: string, o?: PathOptions) => path.join(featureDir(f, o), "testcases.json");
export const featureEnvFile = (f: string, o?: PathOptions) => path.join(featureDir(f, o), ".env");
export const testsDir = (f: string, o?: PathOptions) => path.join(rootOf(o), "tests", assertFeatureName(f));
export const authDir = (o?: PathOptions) => path.join(rootOf(o), "auth");
export const authFile = (f: string, o?: PathOptions) => path.join(authDir(o), `${assertFeatureName(f)}.json`);
export const authMetaFile = (f: string, o?: PathOptions) => path.join(authDir(o), `${assertFeatureName(f)}.meta.json`);
export const authFlagFile = (f: string, o?: PathOptions) => path.join(authDir(o), `${assertFeatureName(f)}.save`);

/** Thư mục gốc evidence: biến EVIDENCE_ROOT, mặc định ./evidence. */
export function evidenceRoot(opts?: PathOptions & { env?: NodeJS.ProcessEnv }): string {
  const env = opts?.env ?? process.env;
  const configured = env.EVIDENCE_ROOT?.trim();
  return path.resolve(rootOf(opts), configured || "evidence");
}

/** Ngày YYYY-MM-DD theo giờ địa phương của máy chạy tool. */
export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Thời điểm dạng ISO 8601 kèm múi giờ của máy, ví dụ 2026-10-07T15:36:39+07:00. */
export function localIso(d: Date = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

export function runName(feature: string, round: number, date: string = localDate()): string {
  const base = `${date}_${assertFeatureName(feature)}`;
  return round <= 1 ? base : `${base}_r${round}`;
}

export interface RunDirOptions extends PathOptions {
  date?: string;
  env?: NodeJS.ProcessEnv;
}

/** Đường dẫn đợt kế tiếp chưa tồn tại. Không tạo thư mục. */
export function nextRunDir(feature: string, opts?: RunDirOptions): string {
  const base = evidenceRoot(opts);
  for (let round = 1; ; round++) {
    const dir = path.join(base, runName(feature, round, opts?.date));
    if (!fs.existsSync(dir)) return dir;
  }
}

/**
 * Tạo thư mục đợt mới. mkdir không đệ quy ở lớp cuối nên hai tiến trình chạy
 * cùng lúc không bao giờ nhận cùng một thư mục.
 */
export function createRunDir(feature: string, opts?: RunDirOptions): string {
  const base = evidenceRoot(opts);
  fs.mkdirSync(base, { recursive: true });
  for (let round = 1; ; round++) {
    const dir = path.join(base, runName(feature, round, opts?.date));
    try {
      fs.mkdirSync(dir);
      return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
}
