import fs from "node:fs";
import path from "node:path";
import express, { Router } from "express";
import { z } from "zod";
import { readFeature } from "../core/feature-store.ts";
import { readLast, RunnerBusyError, type PlaywrightRunner } from "../core/playwright-runner.ts";
import { testsDir } from "../core/paths.ts";
import { featureParam, HttpError, type ToolContext } from "./http.ts";
import { listRuns, resolveRun, resolveRunDir } from "./runs.ts";

const RunBody = z.object({ run: z.string().min(1), spec: z.string().min(1).optional() });
const SPEC_NAME = /^[A-Za-z0-9_-]+\.spec\.ts$/;

function listSpecs(feature: string, ctx: ToolContext): string[] {
  const dir = testsDir(feature, ctx);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => SPEC_NAME.test(n)).sort();
}

/** Các file trace.zip trong `<đợt>/test-results`, tương đối với gốc project (để dán vào `npx playwright show-trace`). */
function listTraces(runDir: string, ctx: ToolContext): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name === "trace.zip") out.push(path.relative(ctx.root, full).split(path.sep).join("/"));
    }
  };
  walk(path.join(runDir, "test-results"), 0);
  return out.sort();
}

export function playwrightRouter(ctx: ToolContext, runner: PlaywrightRunner): Router {
  const r = Router({ mergeParams: true });

  // Trạng thái: tiến trình đang chạy (của bất kỳ tính năng nào), kết quả gần nhất của đợt, spec và trace.
  r.get("/", (req, res) => {
    const feature = featureParam(req);
    const runName = typeof req.query.run === "string" && req.query.run ? req.query.run : listRuns(feature, ctx)[0]?.name;
    const dir = runName ? resolveRunDir(feature, runName, ctx) : null;
    res.json({
      running: runner.running(),
      run: runName ?? null,
      specs: listSpecs(feature, ctx),
      last: dir ? readLast(dir) : null,
      has_report: dir ? fs.existsSync(path.join(dir, "playwright-report", "index.html")) : false,
      traces: dir ? listTraces(dir, ctx) : [],
    });
  });

  r.post("/run", (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx); // 404 nếu tính năng chưa có
    const body = RunBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, z.prettifyError(body.error));
    const dir = resolveRunDir(feature, body.data.run, ctx);
    let spec: string | undefined;
    if (body.data.spec) {
      const name = path.posix.basename(body.data.spec);
      if (body.data.spec !== `tests/${feature}/${name}` || !SPEC_NAME.test(name)) {
        throw new HttpError(400, `spec phải có dạng tests/${feature}/<id>.spec.ts.`);
      }
      if (!fs.existsSync(path.join(testsDir(feature, ctx), name))) throw new HttpError(404, `Không tìm thấy ${body.data.spec}.`);
      spec = body.data.spec;
    } else if (!listSpecs(feature, ctx).length) {
      throw new HttpError(409, `Chưa có spec nào trong tests/${feature}/.`);
    }
    try {
      res.status(202).json(runner.start({ feature, runDir: dir, spec }));
    } catch (err) {
      if (err instanceof RunnerBusyError) throw new HttpError(409, err.message);
      throw err;
    }
  });

  r.post("/stop", async (req, res) => {
    const feature = featureParam(req);
    const running = runner.running();
    if (!running) throw new HttpError(409, "Không có tiến trình Playwright nào đang chạy.");
    if (running.feature !== feature) throw new HttpError(409, `Tiến trình đang chạy thuộc tính năng ${running.feature}.`);
    await runner.stop();
    res.json({ stopped: true });
  });

  return r;
}

/** `/report/<đợt>/` phục vụ `<đợt>/playwright-report/` cho iframe. */
export function reportRouter(ctx: ToolContext): Router {
  const r = Router();
  r.use("/:run", (req, res, next) => {
    const { dir } = resolveRun(String(req.params.run), ctx);
    express.static(path.join(dir, "playwright-report"), { dotfiles: "ignore", index: "index.html" })(req, res, next);
  });
  return r;
}
