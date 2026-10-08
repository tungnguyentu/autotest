import fs from "node:fs";
import { parseEnv } from "node:util";
import { featureEnvFile, type PathOptions } from "./paths.ts";

/** Khóa -> giá trị trong features/<f>/.env. Chỉ giữ trong bộ nhớ, không bao giờ in. */
export type Secrets = Record<string, string>;

/** Giá trị ngắn hơn mức này không che, vì sẽ che nhầm chữ thường gặp. */
export const MIN_SECRET_LENGTH = 3;

/** Đọc features/<f>/.env. Chưa có file thì trả về object rỗng. */
export function loadSecrets(feature: string, opts?: PathOptions): Secrets {
  const file = featureEnvFile(feature, opts);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  const out: Secrets = {};
  for (const [key, value] of Object.entries(parseEnv(raw))) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * Thay mọi giá trị bí mật trong chuỗi bằng <secret:KEY>. Một lượt duy nhất, giá trị dài được thử trước,
 * nên chỗ đã thay không bị thay lần nữa (giá trị "secret" không phá <secret:KEY>).
 */
export function redactText(text: string, secrets: Secrets): string {
  const byValue = new Map<string, string>();
  for (const [key, value] of Object.entries(secrets)) {
    if (value.length >= MIN_SECRET_LENGTH && !byValue.has(value)) byValue.set(value, key);
  }
  if (!byValue.size) return text;
  const pattern = [...byValue.keys()]
    .sort((a, b) => b.length - a.length)
    .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return text.replace(new RegExp(pattern, "g"), (match) => `<secret:${byValue.get(match)}>`);
}

/** Che đệ quy mọi chuỗi trong giá trị JSON (khóa của object giữ nguyên). */
export function redact<T>(data: T, secrets: Secrets): T {
  if (typeof data === "string") return redactText(data, secrets) as T;
  if (Array.isArray(data)) return data.map((item) => redact(item, secrets)) as T;
  if (data !== null && typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) out[k] = redact(v, secrets);
    return out as T;
  }
  return data;
}
