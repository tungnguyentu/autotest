import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PROJECT_ROOT, type PathOptions } from "./paths.ts";

/** Cài đặt riêng trên máy tester. Không commit (đã có trong .gitignore). */
export const SETTINGS_FILE = "settings.local.json";

export const SettingsSchema = z.object({
  playwright: z
    .object({
      /** true: chạy ẩn trình duyệt. false: mở cửa sổ trình duyệt để tester xem. */
      headless: z.boolean().default(true),
    })
    .default({ headless: true }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const settingsPath = (opts?: PathOptions) => path.join(opts?.root ?? PROJECT_ROOT, SETTINGS_FILE);

export function readSettings(opts?: PathOptions): Settings {
  const file = settingsPath(opts);
  if (!fs.existsSync(file)) return SettingsSchema.parse({});
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${SETTINGS_FILE} không phải JSON hợp lệ: ${(err as Error).message}`);
  }
  const parsed = SettingsSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${SETTINGS_FILE} sai cấu trúc: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

export function writeSettings(settings: Settings, opts?: PathOptions): void {
  fs.writeFileSync(settingsPath(opts), JSON.stringify(SettingsSchema.parse(settings), null, 2) + "\n");
}

function parseBool(value: string, name: string): boolean {
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  throw new Error(`${name}="${value}" không hợp lệ. Dùng true hoặc false.`);
}

/**
 * Playwright chạy ẩn hay mở cửa sổ. Thứ tự ưu tiên:
 * cờ dòng lệnh (`--headed` / `--headless`) > biến môi trường HEADLESS > settings.local.json > mặc định ẩn.
 */
export function resolveHeadless(headed: boolean | undefined, opts?: PathOptions & { env?: NodeJS.ProcessEnv }): boolean {
  if (headed !== undefined) return !headed;
  const env = (opts?.env ?? process.env).HEADLESS;
  if (env !== undefined && env.trim() !== "") return parseBool(env, "HEADLESS");
  return readSettings(opts).playwright.headless;
}

export { parseBool };
