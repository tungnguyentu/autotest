import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { readFeature } from "../core/feature-store.ts";
import { createRunDir, evidenceRoot, featureFile } from "../core/paths.ts";
import { buildSummaryText, loadRunData, parseSummary, writeSummary } from "../core/summary.ts";
import { featureParam, HttpError, type ToolContext } from "./http.ts";

export interface RunInfo {
  name: string;
  date: string;
  round: number;
  has_summary: boolean;
  ai_run_ids: string[];
  ui_diff_screens: string[];
  has_playwright_report: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Tên đợt hợp lệ của một tính năng: <YYYY-MM-DD>_<feature>[_rN], khớp chính xác. */
function runPattern(feature: string): RegExp {
  return new RegExp(`^(\\d{4}-\\d{2}-\\d{2})_${escapeRe(feature)}(?:_r(\\d+))?$`);
}

function listDir(dir: string, filter: (e: fs.Dirent) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter(filter).map((e) => e.name).sort();
}

function describeRun(dir: string, name: string, date: string, round: number): RunInfo {
  return {
    name,
    date,
    round,
    has_summary: fs.existsSync(path.join(dir, "summary.md")),
    ai_run_ids: listDir(path.join(dir, "ai-run"), (e) => e.isFile() && e.name.endsWith(".json")).map((n) => n.slice(0, -5)),
    ui_diff_screens: listDir(path.join(dir, "ui-diff"), (e) => e.isDirectory()),
    has_playwright_report: fs.existsSync(path.join(dir, "playwright-report", "index.html")),
  };
}

/** Các đợt của tính năng, mới nhất trước. */
export function listRuns(feature: string, ctx: ToolContext): RunInfo[] {
  const base = evidenceRoot(ctx);
  const re = runPattern(feature);
  const runs: RunInfo[] = [];
  for (const name of listDir(base, (e) => e.isDirectory())) {
    const m = re.exec(name);
    if (m) runs.push(describeRun(path.join(base, name), name, m[1]!, m[2] ? Number(m[2]) : 1));
  }
  return runs.sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round);
}

/** Đường dẫn thư mục đợt đã có. Tên đợt phải đúng mẫu của tính năng nên không thể thoát khỏi evidence root. */
export function resolveRunDir(feature: string, run: string, ctx: ToolContext): string {
  if (!runPattern(feature).test(run)) throw new HttpError(400, `Tên đợt không hợp lệ cho tính năng ${feature}: ${run}`);
  const dir = path.join(evidenceRoot(ctx), run);
  if (!fs.existsSync(dir)) throw new HttpError(404, `Không tìm thấy đợt: ${run}`);
  return dir;
}

const RUN_NAME = /^\d{4}-\d{2}-\d{2}_([a-z0-9][a-z0-9_-]*?)(?:_r\d+)?$/i;

/**
 * Tính năng và thư mục của một đợt, chỉ từ tên đợt (cho các route không có :f).
 * Tên tính năng có thể chứa `_r2` nên thử bản bỏ hậu tố vòng trước, rồi tên đầy đủ, và lấy tên có feature.json.
 */
export function resolveRun(run: string, ctx: ToolContext): { feature: string; dir: string } {
  const m = RUN_NAME.exec(run);
  if (!m) throw new HttpError(400, `Tên đợt không hợp lệ: ${run}`);
  const full = run.slice("YYYY-MM-DD_".length);
  const feature = [m[1]!, full].find((f) => fs.existsSync(featureFile(f, ctx)));
  if (!feature) throw new HttpError(404, `Không tìm thấy tính năng của đợt: ${run}`);
  return { feature, dir: resolveRunDir(feature, run, ctx) };
}

const SummaryEdit = z.object({
  conclusion: z.string().max(100_000).optional(),
  tester: z.string().max(200).optional(),
  environment: z.string().max(500).optional(),
  build: z.string().max(500).optional(),
});

function summaryPayload(feature: string, dir: string, ctx: ToolContext) {
  const file = path.join(dir, "summary.md");
  const exists = fs.existsSync(file);
  const markdown = exists ? fs.readFileSync(file, "utf8") : buildSummaryText(feature, dir, {}, ctx);
  const parsed = parseSummary(markdown);
  return { exists, markdown, front: parsed.front, conclusion: parsed.conclusion };
}

export function runsRouter(ctx: ToolContext): Router {
  const r = Router({ mergeParams: true });

  r.get("/", (req, res) => {
    res.json(listRuns(featureParam(req), ctx));
  });

  r.post("/", (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx); // 404 nếu tính năng chưa có, để gõ sai tên không rải thư mục evidence mồ côi
    const dir = createRunDir(feature, ctx);
    res.status(201).json({ name: path.basename(dir) });
  });

  r.get("/:run", (req, res) => {
    const feature = featureParam(req);
    const run = String(req.params.run);
    const dir = resolveRunDir(feature, run, ctx);
    const info = listRuns(feature, ctx).find((x) => x.name === run);
    const data = loadRunData(dir);
    res.json({
      ...info,
      summary: summaryPayload(feature, dir, ctx),
      ai_runs: data.aiRuns.map((a) => ({
        id: a.id,
        verdict: a.ai_result?.verdict ?? null,
        decision: a.tester.decision,
      })),
      problems: data.problems,
    });
  });

  // Sinh lại summary.md từ dữ liệu trong đợt, giữ frontmatter và "Kết luận của tester".
  r.post("/:run/summary/generate", (req, res) => {
    const feature = featureParam(req);
    const dir = resolveRunDir(feature, String(req.params.run), ctx);
    writeSummary(feature, dir, {}, ctx);
    res.json(summaryPayload(feature, dir, ctx));
  });

  // Tester sửa "Kết luận" và các trường frontmatter. Phần còn lại của file được sinh lại.
  r.put("/:run/summary", (req, res) => {
    const feature = featureParam(req);
    const dir = resolveRunDir(feature, String(req.params.run), ctx);
    const body = SummaryEdit.safeParse(req.body);
    if (!body.success) throw new HttpError(400, z.prettifyError(body.error));
    writeSummary(feature, dir, body.data, ctx);
    res.json(summaryPayload(feature, dir, ctx));
  });

  return r;
}
