import fs from "node:fs";
import path from "node:path";
import { aiRunFile, readAiRun, setTesterDecision } from "./ai-run-store.ts";
import { addBug } from "./bugs.ts";
import { readTestCases, writeTestCases } from "./feature-store.ts";
import { localIso, testsDir, type PathOptions } from "./paths.ts";
import { readLast } from "./playwright-runner.ts";
import { parseTestCases, type TestCase } from "./schemas.ts";

// Các quyết định của tester. Claude chỉ gọi khi tester nói rõ trong chat.

/** Lỗi do quyết định không hợp lệ ở trạng thái hiện tại. Thông báo nói tester cần làm gì. */
export class ReviewError extends Error {}

/** Trạng thái tester đổi được ở bước duyệt test case. Các trạng thái khác do bước chạy thử và chuyển spec đặt. */
const REVIEW_STATUSES: readonly string[] = ["draft", "reviewed"];

function findCase(list: TestCase[], id: string): number {
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) throw new ReviewError(`Không tìm thấy test case ${id}.`);
  return idx;
}

/** Duyệt hoặc bỏ duyệt test case: chỉ đổi giữa draft và reviewed. Kiểm tra hết rồi mới ghi. */
export function setTestcaseStatus(feature: string, ids: string[], status: "draft" | "reviewed", opts?: PathOptions): TestCase[] {
  if (!ids.length) throw new ReviewError("Chưa chọn test case nào.");
  const list = readTestCases(feature, opts);
  const changed: TestCase[] = [];
  for (const id of ids) {
    const idx = findCase(list, id);
    const before = list[idx]!;
    if (before.status === status) continue;
    if (!REVIEW_STATUSES.includes(before.status)) {
      throw new ReviewError(`${id}: đang ở trạng thái "${before.status}", không đổi thành "${status}" ở bước duyệt. Chỉ đổi được giữa draft và reviewed.`);
    }
    list[idx] = { ...before, status };
    changed.push(list[idx]!);
  }
  writeTestCases(feature, list, opts);
  return changed;
}

/** Trạng thái test case mà tester còn quyết định được kết quả AI. */
const DECIDABLE = ["reviewed", "ai-passed", "ai-failed"];

export interface AiDecisionInput {
  decision: "confirmed" | "rejected";
  note?: string;
  /** Mô tả bug nghi ngờ. Có thì ghi vào `<đợt>/bugs.md`. */
  suspectedBug?: string;
}

/** Tester xác nhận hoặc từ chối kết quả AI chạy thử: ghi `tester` vào ai-run, đổi status thành ai-passed hoặc ai-failed. */
export function decideAiRun(feature: string, runDir: string, id: string, input: AiDecisionInput, opts?: PathOptions) {
  if (!fs.existsSync(aiRunFile(runDir, id))) throw new ReviewError(`Không có ai-run/${id}.json trong đợt ${path.basename(runDir)}.`);
  const aiRun = readAiRun(runDir, id);
  if (input.decision === "confirmed" && !aiRun.ai_result) {
    throw new ReviewError(`${id}: AI chưa kết thúc lần chạy thử (chưa có ai_result), chưa xác nhận được.`);
  }
  const list = readTestCases(feature, opts);
  const idx = findCase(list, id);
  const before = list[idx]!;
  if (!DECIDABLE.includes(before.status)) {
    throw new ReviewError(`${id}: test case đang ở trạng thái "${before.status}", không đổi quyết định ở bước này.`);
  }
  const decidedAt = localIso();
  const note = input.note ?? "";
  const status = input.decision === "confirmed" ? "ai-passed" : "ai-failed";
  const next = parseTestCases(list.map((t, i) => (i === idx ? { ...t, status } : t)));
  setTesterDecision(runDir, id, { decision: input.decision, note, decided_at: decidedAt });
  writeTestCases(feature, next, opts);
  const bug = input.suspectedBug?.trim();
  if (bug) addBug(runDir, { id, title: before.title, suspected: bug, note, decidedAt });
  return { id, decision: input.decision, status, decided_at: decidedAt, bug_recorded: Boolean(bug) };
}

/** Đưa vào regression (ai-passed thành automated): spec phải có và pass ở lần chạy gần nhất của đợt, sau lần sửa cuối. */
export function automateTestcase(feature: string, runDir: string, id: string, opts?: PathOptions): TestCase {
  const list = readTestCases(feature, opts);
  const idx = findCase(list, id);
  const before = list[idx]!;
  if (before.status !== "ai-passed") {
    throw new ReviewError(`${id}: chỉ đưa vào regression test case đang ở trạng thái ai-passed (hiện là "${before.status}").`);
  }
  const specName = `${id}.spec.ts`;
  const specFile = path.join(testsDir(feature, opts), specName);
  if (!fs.existsSync(specFile)) throw new ReviewError(`${id}: chưa có tests/${feature}/${specName}. Chuyển sang Playwright trước (skill to-playwright).`);
  const run = path.basename(runDir);
  const last = readLast(runDir);
  if (!last) throw new ReviewError(`Đợt ${run} chưa chạy Playwright. Chạy spec trước.`);
  const mine = last.tests.filter((t) => t.file === specName);
  if (!mine.length) throw new ReviewError(`Lần chạy gần nhất của đợt ${run} không có test của ${specName}. Chạy spec này trước.`);
  const bad = mine.find((t) => t.status !== "passed");
  if (bad) throw new ReviewError(`${specName} chưa pass trong lần chạy gần nhất (kết quả: ${bad.status}). Sửa spec và chạy lại.`);
  if (fs.statSync(specFile).mtimeMs > Date.parse(last.finished_at)) {
    throw new ReviewError(`${specName} đã được sửa sau lần chạy gần nhất. Chạy lại spec trước khi đưa vào regression.`);
  }
  list[idx] = { ...before, status: "automated" };
  writeTestCases(feature, list, opts);
  return list[idx]!;
}
