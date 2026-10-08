import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { readFeature, readTestCases, writeTestCases } from "../core/feature-store.ts";
import { readLast } from "../core/playwright-runner.ts";
import { testsDir } from "../core/paths.ts";
import { parseTestCases, TestCaseSchema, type TestCase } from "../core/schemas.ts";
import { featureParam, HttpError, type ToolContext } from "./http.ts";
import { resolveRunDir } from "./runs.ts";

/** Trạng thái tester được đổi trên UI ở bước duyệt. Các trạng thái khác do bước chạy thử và chuyển spec đặt. */
const REVIEW_STATUSES: readonly string[] = ["draft", "reviewed"];

function assertStatusChange(id: string, from: string, to: string): void {
  if (from === to) return;
  if (REVIEW_STATUSES.includes(from) && REVIEW_STATUSES.includes(to)) return;
  throw new HttpError(409, `${id}: không đổi được trạng thái "${from}" thành "${to}" ở bước này. Chỉ cho phép draft và reviewed.`);
}

const Patch = TestCaseSchema.omit({ id: true }).partial().strict();

export function testcasesRouter(ctx: ToolContext): Router {
  const r = Router({ mergeParams: true });

  r.get("/", (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx);
    const testcases = readTestCases(feature, ctx);
    res.json({ testcases });
  });

  // Thay cả danh sách. Test case có sẵn chỉ đổi trạng thái draft <-> reviewed, test case mới phải là draft.
  r.put("/", (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx);
    const next: TestCase[] = parseTestCases(req.body);
    const current = new Map(readTestCases(feature, ctx).map((t) => [t.id, t]));
    for (const t of next) {
      const before = current.get(t.id);
      if (before) assertStatusChange(t.id, before.status, t.status);
      else if (t.status !== "draft") throw new HttpError(400, `${t.id}: test case mới phải có trạng thái draft.`);
    }
    const kept = new Set(next.map((t) => t.id));
    for (const [id, t] of current) {
      if (!kept.has(id) && !REVIEW_STATUSES.includes(t.status)) {
        throw new HttpError(409, `${id}: không xóa được test case có trạng thái "${t.status}".`);
      }
    }
    writeTestCases(feature, next, ctx);
    res.json({ testcases: next });
  });

  // Sửa một test case: nội dung và/hoặc trạng thái (chỉ draft <-> reviewed).
  r.patch("/:id", (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx);
    const id = String(req.params.id);
    const patch = Patch.safeParse(req.body);
    if (!patch.success) throw new HttpError(400, z.prettifyError(patch.error));
    const list = readTestCases(feature, ctx);
    const idx = list.findIndex((t) => t.id === id);
    const before = list[idx];
    if (!before) throw new HttpError(404, `Không tìm thấy test case ${id}.`);
    if (patch.data.status) assertStatusChange(id, before.status, patch.data.status);
    const updated = { ...before, ...patch.data };
    list[idx] = updated;
    writeTestCases(feature, list, ctx);
    res.json(updated);
  });

  // Đưa test case vào regression: ai-passed -> automated. Chỉ khi spec tồn tại và pass trong lần chạy gần nhất của đợt.
  r.post("/:id/automate", (req, res) => {
    const feature = featureParam(req);
    const id = String(req.params.id);
    const run = typeof req.body?.run === "string" ? req.body.run : "";
    if (!run) throw new HttpError(400, "Thiếu trường run (tên đợt chứa lần chạy spec).");
    const list = readTestCases(feature, ctx);
    const idx = list.findIndex((t) => t.id === id);
    const before = list[idx];
    if (!before) throw new HttpError(404, `Không tìm thấy test case ${id}.`);
    if (before.status !== "ai-passed") {
      throw new HttpError(409, `${id}: chỉ đưa vào regression test case đang ở trạng thái ai-passed (hiện là "${before.status}").`);
    }
    const specName = `${id}.spec.ts`;
    const specFile = path.join(testsDir(feature, ctx), specName);
    if (!fs.existsSync(specFile)) throw new HttpError(409, `${id}: chưa có tests/${feature}/${specName}. Chạy /to-playwright ${feature} ${id} trước.`);
    const last = readLast(resolveRunDir(feature, run, ctx));
    if (!last) throw new HttpError(409, `Đợt ${run} chưa chạy Playwright. Chạy spec trước.`);
    const mine = last.tests.filter((t) => t.file === specName);
    if (!mine.length) throw new HttpError(409, `Lần chạy gần nhất của đợt ${run} không có test của ${specName}. Chạy spec này trước.`);
    const bad = mine.find((t) => t.status !== "passed");
    if (bad) throw new HttpError(409, `${specName} chưa pass trong lần chạy gần nhất (kết quả: ${bad.status}). Sửa spec và chạy lại.`);
    if (fs.statSync(specFile).mtimeMs > Date.parse(last.finished_at)) {
      throw new HttpError(409, `${specName} đã được sửa sau lần chạy gần nhất. Chạy lại spec trước khi đưa vào regression.`);
    }
    const next = list.map((t, i) => (i === idx ? { ...t, status: "automated" as const } : t));
    writeTestCases(feature, next, ctx);
    res.json(next[idx]);
  });

  return r;
}
