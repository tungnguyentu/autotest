import { readFeature, readTestCases } from "../core/feature-store.ts";
import type { PathOptions } from "../core/paths.ts";
import type { TestCase } from "../core/schemas.ts";

export interface ValidateResult {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  /** Vấn đề không làm file sai schema nhưng tester cần biết. */
  warnings: string[];
}

const count = (items: string[]) => items.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});

/** Kiểm tra testcases.json theo schema (readTestCases ném lỗi nếu sai) và đối chiếu screen với feature.json. */
export function validateTestCases(feature: string, opts?: PathOptions): ValidateResult {
  const cases: TestCase[] = readTestCases(feature, opts);
  const screens = new Set(Object.keys(readFeature(feature, opts).screens));
  const warnings: string[] = [];
  for (const tc of cases) {
    if (tc.screen && !screens.has(tc.screen)) warnings.push(`${tc.id}: screen "${tc.screen}" không có trong feature.json.`);
    if (/\b(otp|captcha)\b/i.test([...tc.steps, ...tc.preconditions].join(" ")) && !tc.manual) {
      warnings.push(`${tc.id}: nhắc OTP hoặc captcha nhưng chưa đánh dấu manual: true.`);
    }
  }
  return { total: cases.length, byType: count(cases.map((t) => t.type)), byStatus: count(cases.map((t) => t.status)), warnings };
}
