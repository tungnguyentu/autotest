import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { applyUnifiedDiff, checkLocatorOnly, DiffError } from "../core/apply-diff.ts";
import { testsDir } from "../core/paths.ts";
import { RunnerBusyError, type PlaywrightRunner } from "../core/playwright-runner.ts";
import type { PlaywrightLast } from "../core/schemas.ts";
import { HttpError, type ToolContext } from "./http.ts";
import { resolveRun } from "./runs.ts";

const ID = /^[A-Za-z0-9_-]+$/;

function idParam(raw: unknown): string {
  const id = String(raw);
  if (!ID.test(id)) throw new HttpError(400, `ID test case không hợp lệ: ${id}`);
  return id;
}

const readIfExists = (file: string): string | null => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

/**
 * Đề xuất sửa locator do skill `heal-locator` ghi vào `<đợt>/heal/<id>.diff` và `<id>.md`.
 * Áp dụng chỉ khi tester bấm, sau khi kiểm tra diff chỉ đổi dòng locator.
 */
export function healRouter(ctx: ToolContext, runner: PlaywrightRunner): Router {
  const r = Router();

  r.get("/:run/heal/:id", (req, res) => {
    const { dir } = resolveRun(String(req.params.run), ctx);
    const id = idParam(req.params.id);
    const diff = readIfExists(path.join(dir, "heal", `${id}.diff`));
    res.json({
      id,
      diff,
      reason: readIfExists(path.join(dir, "heal", `${id}.md`)),
      problems: diff === null ? [] : checkLocatorOnly(diff),
      has_backup: fs.existsSync(path.join(dir, "heal", `${id}.spec.ts.bak`)),
    });
  });

  r.post("/:run/heal/:id/apply", async (req, res) => {
    const { feature, dir } = resolveRun(String(req.params.run), ctx);
    const id = idParam(req.params.id);
    const diff = readIfExists(path.join(dir, "heal", `${id}.diff`));
    if (diff === null) throw new HttpError(404, `Không có đề xuất sửa locator cho ${id} trong đợt này.`);
    const problems = checkLocatorOnly(diff);
    if (problems.length) throw new HttpError(409, `Từ chối áp dụng, diff không chỉ đổi dòng locator: ${problems.join("; ")}`);

    const specRel = `tests/${feature}/${id}.spec.ts`;
    const specFile = path.join(testsDir(feature, ctx), `${id}.spec.ts`);
    const original = readIfExists(specFile);
    if (original === null) throw new HttpError(404, `Không tìm thấy ${specRel}.`);
    if (runner.running()) throw new HttpError(409, "Playwright đang chạy. Chờ xong hoặc bấm Dừng rồi áp dụng lại.");

    let patched: string;
    try {
      patched = applyUnifiedDiff(original, diff);
    } catch (err) {
      if (err instanceof DiffError) throw new HttpError(409, err.message);
      throw err;
    }

    // Bản sao lưu là spec ngay trước lần áp dụng này. Ghi bản sao lưu xong mới đụng vào spec.
    // Lần áp thứ hai trở đi không đè bản sao đầu (bản gốc trước healing): .bak, .bak.2, .bak.3, ...
    const backupBase = path.join(dir, "heal", `${id}.spec.ts.bak`);
    let backup = backupBase;
    for (let n = 2; fs.existsSync(backup); n++) backup = `${backupBase}.${n}`;
    fs.copyFileSync(specFile, backup, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(specFile, patched);

    let finished: (last: PlaywrightLast | null) => void = () => {};
    const done = new Promise<PlaywrightLast | null>((resolve) => (finished = resolve));
    try {
      runner.start({ feature, runDir: dir, spec: specRel, onFinish: (last) => finished(last) });
    } catch (err) {
      // Không chạy lại được: trả spec về nguyên trạng để tester không bị kẹt với spec chưa được kiểm chứng.
      fs.writeFileSync(specFile, original);
      if (err instanceof RunnerBusyError) throw new HttpError(409, err.message);
      throw err;
    }
    const last = await done;
    res.json({
      id,
      applied: true,
      backup: path.relative(ctx.root, backup).split(path.sep).join("/"),
      last,
      passed: Boolean(last && last.exit_code === 0 && last.tests.length > 0 && last.tests.every((t) => t.status === "passed")),
    });
  });

  return r;
}
