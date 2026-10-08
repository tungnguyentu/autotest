import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { addBug } from "../core/bugs.ts";
import { aiRunFile, readAiRun, setTesterDecision } from "../core/ai-run-store.ts";
import { readTestCases, writeTestCases } from "../core/feature-store.ts";
import { localIso } from "../core/paths.ts";
import { parseTestCases } from "../core/schemas.ts";
import { loadRunData } from "../core/summary.ts";
import { HttpError, type ToolContext } from "./http.ts";
import { resolveRun } from "./runs.ts";

const Decision = z.object({
  decision: z.enum(["confirmed", "rejected"]),
  note: z.string().max(10_000).default(""),
  suspected_bug: z.string().max(10_000).optional(),
});

/** Trạng thái test case mà tester còn quyết định được. `draft` chưa duyệt, `automated` đã vào regression. */
const DECIDABLE = ["reviewed", "ai-passed", "ai-failed"];

const FILE_EXTENSIONS = new Set([".png", ".md", ".json", ".txt", ".html"]);
const ID = /^[a-z0-9][a-z0-9_-]*$/i;

function mdOf(runDir: string, id: string): string | null {
  try {
    return fs.readFileSync(path.join(runDir, "ai-run", `${id}.md`), "utf8");
  } catch {
    return null;
  }
}

/** Đọc ai-run mà thông báo lỗi không lộ đường dẫn tuyệt đối. */
function loadAiRun(runDir: string, id: string) {
  if (!ID.test(id)) throw new HttpError(400, `Mã test case không hợp lệ: ${id}`);
  if (!fs.existsSync(aiRunFile(runDir, id))) throw new HttpError(404, `Không tìm thấy ai-run/${id}.json trong đợt này.`);
  try {
    return readAiRun(runDir, id);
  } catch (err) {
    throw new HttpError(500, `ai-run/${id}.json không đọc được: ${(err as Error).message.split("\n")[0]}`);
  }
}

export function aiRunsRouter(ctx: ToolContext): Router {
  const r = Router();

  r.get("/:run/ai-runs", (req, res) => {
    const { feature, dir } = resolveRun(String(req.params.run), ctx);
    const testcases = new Map(readTestCases(feature, ctx).map((t) => [t.id, t]));
    const data = loadRunData(dir);
    res.json({
      run: path.basename(dir),
      feature,
      ai_runs: data.aiRuns.map((a) => ({
        ...a,
        title: testcases.get(a.id)?.title ?? null,
        status: testcases.get(a.id)?.status ?? null,
        md: mdOf(dir, a.id),
      })),
      problems: data.problems.filter((p) => p.startsWith("ai-run/")),
    });
  });

  r.post("/:run/ai-runs/:id/decision", (req, res) => {
    const { feature, dir } = resolveRun(String(req.params.run), ctx);
    const id = String(req.params.id);
    const body = Decision.safeParse(req.body);
    if (!body.success) throw new HttpError(400, z.prettifyError(body.error));
    const { decision, note, suspected_bug: suspected } = body.data;

    const aiRun = loadAiRun(dir, id);
    if (decision === "confirmed" && !aiRun.ai_result) {
      throw new HttpError(409, `${id}: AI chưa kết thúc lần chạy thử (chưa có ai_result), chưa xác nhận được.`);
    }
    const list = readTestCases(feature, ctx);
    const idx = list.findIndex((t) => t.id === id);
    const before = list[idx];
    if (!before) throw new HttpError(404, `Không tìm thấy test case ${id} trong testcases.json.`);
    if (!DECIDABLE.includes(before.status)) {
      throw new HttpError(409, `${id}: test case đang ở trạng thái "${before.status}", không đổi quyết định ở bước này.`);
    }

    // Kiểm tra mọi thứ trước khi ghi file nào.
    const decidedAt = localIso();
    const next = parseTestCases(list.map((t, i) => (i === idx ? { ...t, status: decision === "confirmed" ? "ai-passed" : "ai-failed" } : t)));
    setTesterDecision(dir, id, { decision, note, decided_at: decidedAt });
    writeTestCases(feature, next, ctx);
    if (suspected?.trim()) {
      addBug(dir, { id, title: before.title, suspected, note, decidedAt });
    }
    res.json({ id, decision, status: next[idx]!.status, decided_at: decidedAt, bug_recorded: Boolean(suspected?.trim()) });
  });

  // Ảnh step, ai-run/*.md, log: chỉ file nằm trong thư mục đợt, chỉ vài đuôi file.
  r.get("/:run/files/*path", (req, res, next) => {
    const { dir } = resolveRun(String(req.params.run), ctx);
    const segments = (req.params.path as unknown as string[]) ?? [];
    if (!segments.length || segments.some((s) => !s || s === "." || s === ".." || s.startsWith(".") || /[\\\0]/.test(s))) {
      throw new HttpError(400, "Đường dẫn file không hợp lệ.");
    }
    const ext = path.extname(segments.at(-1)!).toLowerCase();
    if (!FILE_EXTENSIONS.has(ext)) throw new HttpError(403, `Không phục vụ file ${ext || "không có đuôi"}. Chỉ cho phép ${[...FILE_EXTENSIONS].join(", ")}.`);
    const abs = path.resolve(dir, ...segments);
    let real: string;
    try {
      real = fs.realpathSync(abs);
    } catch {
      throw new HttpError(404, "Không tìm thấy file.");
    }
    const rel = path.relative(fs.realpathSync(dir), real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new HttpError(400, "Đường dẫn file nằm ngoài thư mục đợt.");
    if (!fs.statSync(real).isFile()) throw new HttpError(404, "Không tìm thấy file.");
    res.sendFile(real, { dotfiles: "allow", headers: { "Cache-Control": "no-cache", "Content-Security-Policy": "sandbox" } }, (err) => {
      if (err && !res.headersSent) next(err);
    });
  });

  return r;
}
