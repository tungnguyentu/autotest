import fs from "node:fs";
import path from "node:path";
import {
  featureDir,
  featureFile,
  featuresDir,
  testcasesFile,
  type PathOptions,
} from "./paths.ts";
import { parseFeature, parseTestCases, type Feature, type TestCase } from "./schemas.ts";

function readJson(file: string, label: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Không tìm thấy ${label}: ${file}`);
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} không phải JSON hợp lệ (${file}): ${(err as Error).message}`);
  }
}

/** Ghi qua file tạm rồi đổi tên, để UI và skill không đọc phải file ghi dở. */
export function writeTextAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

export function writeJsonAtomic(file: string, data: unknown): void {
  writeTextAtomic(file, JSON.stringify(data, null, 2) + "\n");
}

/** Tên các tính năng có feature.json trong features/. */
export function listFeatures(opts?: PathOptions): string[] {
  const dir = featuresDir(opts);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "feature.json")))
    .map((e) => e.name)
    .sort();
}

export function readFeature(feature: string, opts?: PathOptions): Feature {
  const parsed = parseFeature(readJson(featureFile(feature, opts), "feature.json"));
  if (parsed.feature !== feature) {
    throw new Error(`feature.json khai báo feature "${parsed.feature}" nhưng nằm trong thư mục "${feature}".`);
  }
  return parsed;
}

export function writeFeature(feature: Feature, opts?: PathOptions): void {
  const valid = parseFeature(feature);
  writeJsonAtomic(featureFile(valid.feature, opts), valid);
}

/** Chưa có testcases.json thì trả về mảng rỗng. */
export function readTestCases(feature: string, opts?: PathOptions): TestCase[] {
  const file = testcasesFile(feature, opts);
  if (!fs.existsSync(file)) return [];
  return parseTestCases(readJson(file, "testcases.json"));
}

export function writeTestCases(feature: string, cases: TestCase[], opts?: PathOptions): void {
  writeJsonAtomic(testcasesFile(feature, opts), parseTestCases(cases));
}

export function ensureFeatureDir(feature: string, opts?: PathOptions): string {
  const dir = featureDir(feature, opts);
  fs.mkdirSync(path.join(dir, "usecases"), { recursive: true });
  return dir;
}
