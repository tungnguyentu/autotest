import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { readFeature } from "./tool/core/feature-store.ts";
import { assertFeatureName, authFile, featureEnvFile, nextRunDir } from "./tool/core/paths.ts";

function fail(message: string): never {
  console.error(`[playwright.config] ${message}`);
  process.exit(1);
}

const featureEnv = process.env.FEATURE?.trim();
if (!featureEnv) {
  fail("Chưa đặt biến FEATURE. Ví dụ: FEATURE=staging npx playwright test");
}

let feature: string;
let cfg: ReturnType<typeof readFeature>;
try {
  feature = assertFeatureName(featureEnv);
  cfg = readFeature(feature);
} catch (err) {
  fail((err as Error).message);
}

// Credential của tính năng (nếu có). Không in giá trị.
const envFile = featureEnvFile(feature);
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// Đặt EVIDENCE_DIR vào env để các worker dùng cùng một thư mục đợt.
// Chỉ tính tên, thư mục do Playwright tạo; lần chạy sau cùng ngày sẽ nhận _r2, _r3.
const runDir = process.env.EVIDENCE_DIR?.trim() || nextRunDir(feature);
process.env.EVIDENCE_DIR = runDir;

// Chưa đăng nhập thì chạy không có phiên, các screen auth sẽ tự lộ ra là fail.
const state = authFile(feature);
const hasState = fs.existsSync(state);
if (!hasState) {
  console.warn(`[playwright.config] Chưa có ${path.relative(process.cwd(), state)}. Chạy không có phiên đăng nhập.`);
}

// `--list` chỉ liệt kê test, không chạy. Reporter html sẽ tạo thư mục đợt rỗng nên dùng reporter list,
// để thư mục đợt chỉ xuất hiện khi có lần chạy thật hoặc khi tester bấm "Tạo đợt mới".
const listOnly = process.argv.includes("--list");

export default defineConfig({
  testDir: `tests/${feature}`,
  outputDir: path.join(runDir, "test-results"),
  snapshotPathTemplate: `tests/__screenshots__/${feature}/{arg}{ext}`,
  reporter: listOnly
    ? [["list"]]
    : [
        ["list"],
        ["html", { outputFolder: path.join(runDir, "playwright-report"), open: "never" }],
        // Tool đọc file này để biết từng test pass hay fail (playwright-last.json).
        ["json", { outputFile: path.join(runDir, "playwright-results.json") }],
      ],
  use: {
    baseURL: cfg.baseURL,
    viewport: cfg.viewport,
    ...(hasState ? { storageState: state } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: cfg.viewport } }],
});

