import fs from "node:fs";
import path from "node:path";
import { allPassed, runPlaywright, type RunPlaywrightOptions } from "../cli/run-spec.ts";
import { applyUnifiedDiff, checkLocatorOnly, DiffError } from "./apply-diff.ts";
import { PROJECT_ROOT, testsDir } from "./paths.ts";
import type { PlaywrightLast } from "./schemas.ts";
import { ReviewError } from "./review.ts";

export interface HealApplyResult {
  backup: string;
  last: PlaywrightLast | null;
  passed: boolean;
}

/**
 * Áp đề xuất `<đợt>/heal/<id>.diff` vào spec khi tester đồng ý, rồi chạy lại spec.
 * Từ chối diff đổi gì khác ngoài dòng locator. Sao lưu spec trước (`.bak`, `.bak.2`, ...).
 */
export async function applyHeal(opts: Omit<RunPlaywrightOptions, "spec" | "extraArgs"> & { id: string }): Promise<HealApplyResult> {
  const { feature, runDir, id } = opts;
  const root = opts.root ?? PROJECT_ROOT;
  const diffFile = path.join(runDir, "heal", `${id}.diff`);
  if (!fs.existsSync(diffFile)) throw new ReviewError(`Không có đề xuất sửa locator cho ${id} trong đợt ${path.basename(runDir)}.`);
  const diff = fs.readFileSync(diffFile, "utf8");
  const problems = checkLocatorOnly(diff);
  if (problems.length) throw new ReviewError(`Từ chối áp dụng, diff không chỉ đổi dòng locator: ${problems.join("; ")}`);

  const specRel = `tests/${feature}/${id}.spec.ts`;
  const specFile = path.join(testsDir(feature, opts), `${id}.spec.ts`);
  if (!fs.existsSync(specFile)) throw new ReviewError(`Không tìm thấy ${specRel}.`);
  const original = fs.readFileSync(specFile, "utf8");
  let patched: string;
  try {
    patched = applyUnifiedDiff(original, diff);
  } catch (err) {
    if (err instanceof DiffError) throw new ReviewError(err.message);
    throw err;
  }

  // Lần áp thứ hai trở đi không đè bản sao đầu (bản gốc trước healing).
  const backupBase = path.join(runDir, "heal", `${id}.spec.ts.bak`);
  let backup = backupBase;
  for (let n = 2; fs.existsSync(backup); n++) backup = `${backupBase}.${n}`;
  fs.copyFileSync(specFile, backup, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(specFile, patched);

  let last: PlaywrightLast | null;
  try {
    last = await runPlaywright({ ...opts, spec: specRel });
  } catch (err) {
    // Không chạy lại được: trả spec về nguyên trạng để không kẹt với spec chưa kiểm chứng.
    fs.writeFileSync(specFile, original);
    throw err;
  }
  return { backup: path.relative(root, backup).split(path.sep).join("/"), last, passed: allPassed(last) };
}
