import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { resolveHeadless } from "../core/settings.ts";
import { readFeature, writeJsonAtomic } from "../core/feature-store.ts";
import { authFile, featureDir, localIso, publicUrl, PROJECT_ROOT, type PathOptions } from "../core/paths.ts";
import type { Feature, MaskBox, Meta } from "../core/schemas.ts";

export interface CaptureOptions extends PathOptions {
  feature: string;
  /** Thư mục `<đợt>/ui-diff`. Mỗi screen có thư mục con riêng. */
  out: string;
  /** Các screen cần chụp. Bỏ trống để chụp tất cả screen trong feature.json. */
  screens?: string[];
  fullPage?: boolean;
  headed?: boolean;
  /** Dừng giữa chừng (server tắt). Trình duyệt được đóng. */
  signal?: AbortSignal;
  /** Gọi sau khi một screen chụp xong và `meta.json` đã ghi. Chạy tuần tự, mỗi lần một screen. */
  onScreen?: (meta: Meta, dir: string) => void | Promise<void>;
}

const NAV_TIMEOUT_MS = 45_000;
const WAIT_FOR_TIMEOUT_MS = 15_000;
/** File sinh ra từ một lần chụp hoặc so. Xóa trước khi chụp lại để kết quả cũ không bị nhầm là mới. */
const DERIVED = ["actual.png", "figma.png", "diff.png", "side_by_side.png", "metrics.json", "meta.json"];

const trimSlash = (s: string) => s.replace(/\/+$/, "");

function resetScreenDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of DERIVED) fs.rmSync(path.join(dir, name), { force: true });
  fs.rmSync(path.join(dir, "crops"), { recursive: true, force: true });
}

async function captureOne(
  browser: Browser,
  feature: Feature,
  key: string,
  dir: string,
  opts: CaptureOptions,
): Promise<Meta> {
  const screen = feature.screens[key]!;
  resetScreenDir(dir);
  const meta: Meta = {
    screen: key,
    captured_at: localIso(),
    viewport: feature.viewport,
    full_page: Boolean(opts.fullPage),
    scale: screen.scale,
    mask_boxes: [],
    warnings: [],
  };
  const writeMeta = () => writeJsonAtomic(path.join(dir, "meta.json"), meta);

  const root = opts.root ?? PROJECT_ROOT;
  const figma = path.join(featureDir(opts.feature, opts), "figma", `${key}.png`);
  if (fs.existsSync(figma)) {
    fs.copyFileSync(figma, path.join(dir, "figma.png"));
    meta.figma_source = path.relative(root, figma).split(path.sep).join("/");
    meta.figma_modified = localIso(fs.statSync(figma).mtime);
  } else {
    meta.warnings.push(`Thiếu ảnh Figma: ${path.relative(root, figma).split(path.sep).join("/")}. Export frame từ Figma (1x) rồi đặt vào đó.`);
  }

  let storageState: string | undefined;
  if (screen.auth) {
    const state = authFile(opts.feature, opts);
    if (!fs.existsSync(state)) {
      meta.warnings.push(`Thiếu ${path.relative(root, state)}. Đăng nhập tay trên UI (khu Đăng nhập) rồi chụp lại.`);
      writeMeta();
      return meta;
    }
    storageState = state;
  }

  const url = trimSlash(feature.baseURL) + screen.path;
  meta.url = url;
  const context = await browser.newContext({ viewport: feature.viewport, deviceScaleFactor: 1, ...(storageState && { storageState }) });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await page.evaluate("document.fonts.ready");
    for (const sel of screen.wait_for) {
      await page.locator(sel).first().waitFor({ state: "visible", timeout: WAIT_FOR_TIMEOUT_MS });
    }

    const boxes: MaskBox[] = [];
    for (const sel of screen.mask) {
      for (const loc of await page.locator(sel).all()) {
        const box = await loc.boundingBox();
        if (box) boxes.push({ selector: sel, x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) });
      }
    }
    meta.mask_boxes = boxes;

    await page.screenshot({ path: path.join(dir, "actual.png"), fullPage: Boolean(opts.fullPage), animations: "disabled", caret: "hide" });
    meta.final_url = publicUrl(page.url());
    if (trimSlash(page.url()) !== trimSlash(url)) {
      meta.warnings.push(`Bị chuyển hướng tới ${publicUrl(page.url())}. Có thể hết phiên: đăng nhập lại rồi chụp lại.`);
    }
  } catch (err) {
    meta.warnings.push(`Lỗi khi chụp: ${(err as Error).message.split("\n")[0]}`);
  } finally {
    await context.close().catch(() => {});
  }
  writeMeta();
  return meta;
}

/**
 * Chụp từng screen theo feature.json: viewport của tính năng, deviceScaleFactor 1, phiên đăng nhập khi screen `auth`.
 * Ghi `<out>/<screen>/actual.png`, `figma.png` (bản sao) và `meta.json`. Mọi vấn đề thành cảnh báo trong meta, không bỏ qua âm thầm.
 */
export async function captureScreens(opts: CaptureOptions): Promise<Meta[]> {
  const feature = readFeature(opts.feature, opts);
  const keys = opts.screens?.length ? opts.screens : Object.keys(feature.screens);
  if (!keys.length) throw new Error(`Tính năng ${opts.feature} chưa khai báo screen nào trong feature.json.`);
  const unknown = keys.filter((k) => !feature.screens[k]);
  if (unknown.length) throw new Error(`Screen không có trong feature.json: ${unknown.join(", ")}`);

  const browser = await chromium.launch({ headless: resolveHeadless(opts.headed, opts) });
  const abort = () => void browser.close().catch(() => {});
  opts.signal?.addEventListener("abort", abort, { once: true });
  const results: Meta[] = [];
  try {
    for (const key of keys) {
      if (opts.signal?.aborted) throw new Error("Đã dừng.");
      const meta = await captureOne(browser, feature, key, path.join(opts.out, key), opts);
      results.push(meta);
      await opts.onScreen?.(meta, path.join(opts.out, key));
    }
  } finally {
    opts.signal?.removeEventListener("abort", abort);
    await browser.close().catch(() => {});
  }
  return results;
}
