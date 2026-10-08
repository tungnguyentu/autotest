import { chromium } from "playwright";
import fs from "node:fs";
import { resolveHeadless } from "../core/settings.ts";
import { readFeature } from "../core/feature-store.ts";
import { authFile, publicUrl, type PathOptions } from "../core/paths.ts";

export interface CheckSessionOptions extends PathOptions {
  feature: string;
  url: string;
  headed?: boolean;
}

export interface CheckSessionResult {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  redirected: boolean;
  passwordFieldVisible: boolean;
  ok: boolean;
}

/**
 * Kiểm tra file phiên bằng Playwright: nạp auth/<feature>.json, mở URL,
 * báo có bị chuyển hướng hoặc rơi về trang đăng nhập không. Không in cookie.
 */
export async function checkSession(options: CheckSessionOptions): Promise<CheckSessionResult> {
  const feature = readFeature(options.feature, options);
  const state = authFile(options.feature, options);
  if (!fs.existsSync(state)) {
    throw new Error(`Chưa có phiên ${state}. Chạy: npm run cli -- login --feature ${options.feature}`);
  }

  let target: URL;
  try {
    target = new URL(options.url);
  } catch {
    throw new Error(`--url không hợp lệ: ${options.url}`);
  }
  // Không gửi phiên của tính năng này sang site khác.
  if (target.origin !== new URL(feature.baseURL).origin) {
    throw new Error(`--url phải cùng origin với baseURL (${new URL(feature.baseURL).origin}).`);
  }

  const browser = await chromium.launch({ headless: resolveHeadless(options.headed, options) });
  try {
    const context = await browser.newContext({ storageState: state, viewport: feature.viewport });
    const page = await context.newPage();
    await page.goto(target.href, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const finalUrl = page.url();
    const passwordFieldVisible = await page.locator('input[type="password"]:visible').count().then((n) => n > 0);
    const normalize = (u: string) => {
      const x = new URL(u);
      return x.origin + x.pathname.replace(/\/+$/, "");
    };
    const redirected = normalize(finalUrl) !== normalize(target.href);
    return {
      requestedUrl: target.href,
      finalUrl: publicUrl(finalUrl),
      title: await page.title(),
      redirected,
      passwordFieldVisible,
      ok: !redirected && !passwordFieldVisible,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
