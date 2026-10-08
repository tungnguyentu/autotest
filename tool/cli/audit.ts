import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { resolveHeadless } from "../core/settings.ts";
import { readFeature, writeJsonAtomic } from "../core/feature-store.ts";
import { authFile, localIso, publicUrl, PROJECT_ROOT, type PathOptions } from "../core/paths.ts";
import { readPng, stitchVertical, writeSideBySideSegments } from "../core/png-tools.ts";
import type { Feature, Theme } from "../core/schemas.ts";
import { PNG } from "pngjs";

export interface AuditViewport {
  name: string;
  width: number;
  height: number;
}

export interface AuditOptions extends PathOptions {
  feature: string;
  /** Thư mục đợt. Kết quả ở `<runDir>/ui-audit/<screen>/`. */
  runDir: string;
  screens?: string[];
  /** Mặc định: desktop theo feature.json và mobile 390x844. */
  viewports?: AuditViewport[];
  headed?: boolean;
}

type ThemeName = "light" | "dark" | "default";

export interface AuditVariant {
  viewport: string;
  theme: ThemeName;
  final_url?: string;
  shown_theme?: string;
  screenshot?: string;
  /** Ảnh một màn hình ở đầu và cuối trang, thấy được phần tử cố định. */
  viewport_shots?: string[];
  checks?: Record<string, unknown>;
  console: { type: string; text: string }[];
  page_errors: string[];
  failed_requests: { status: number | null; url: string; error?: string }[];
  warnings: string[];
}

export interface ThemeState {
  shown_theme: string;
  stored: string | null;
  toggle_label: string | null;
}

export interface AuditResult {
  feature: string;
  screen: string;
  url: string;
  audited_at: string;
  theme: Theme | null;
  viewports: AuditViewport[];
  variants: AuditVariant[];
  theme_toggle: null | { before: ThemeState; after_click: ThemeState; after_reload: ThemeState; switched: boolean; remembered: boolean; error?: string };
  os_dark_preference: null | { shown_theme: string; follows_os: boolean };
  review_images: string[];
  warnings: string[];
}

const NAV_TIMEOUT_MS = 45_000;
const WAIT_FOR_TIMEOUT_MS = 15_000;
/** Chrome chỉ chụp được khoảng 16384px một lần. Chụp từng khúc nhỏ hơn rồi ghép. */
const CHUNK_PX = 4000;
export const MOBILE: AuditViewport = { name: "mobile", width: 390, height: 844 };

const CHECKS_SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "core", "audit-checks.browser.js"), "utf8");

/** Cuộn hết trang, buộc ảnh lazy tải, chờ ảnh xong rồi về đầu trang. */
const LOAD_ALL_SRC = `new Promise(async (done) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { scrollTo(0, y); await sleep(150); }
  document.querySelectorAll("img").forEach((i) => { i.loading = "eager"; });
  await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.addEventListener("load", r); i.addEventListener("error", r); setTimeout(r, 8000); })));
  scrollTo(0, 0);
  await sleep(800);
  done([...document.images].filter((i) => !i.complete).length);
})`;

function stateSrc(theme: Theme): string {
  return `(() => {
    const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ""); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
    let bg = null;
    for (let e = document.body; e && !bg; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) bg = c; }
    bg = bg || { r: 255, g: 255, b: 255 };
    const f = (x) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    const lum = 0.2126 * f(bg.r) + 0.7152 * f(bg.g) + 0.0722 * f(bg.b);
    let stored = null;
    try { stored = ${theme.key ? `localStorage.getItem(${JSON.stringify(theme.key)})` : "null"}; } catch (e) {}
    const t = ${theme.toggle ? `document.querySelector(${JSON.stringify(theme.toggle)})` : "null"};
    return { shown_theme: lum < 0.2 ? "dark" : "light", stored, toggle_label: t ? (t.getAttribute("aria-label") || t.getAttribute("title") || t.textContent.trim()) : null };
  })()`;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");
const rel = (root: string, p: string) => path.relative(root, p).split(path.sep).join("/");

async function openPage(page: Page, url: string, waitFor: string[], warnings: string[]): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
  } catch {
    warnings.push("Trang không yên mạng (networkidle) sau 45 giây. Đo tiếp với trạng thái hiện có.");
    await page.waitForLoadState("load").catch(() => {});
  }
  await page.evaluate("document.fonts.ready").catch(() => {});
  for (const sel of waitFor) {
    await page.locator(sel).first().waitFor({ state: "visible", timeout: WAIT_FOR_TIMEOUT_MS });
  }
}

async function fullPageShot(page: Page, file: string): Promise<void> {
  const width = page.viewportSize()!.width;
  const height = (await page.evaluate("document.documentElement.scrollHeight")) as number;
  const parts: PNG[] = [];
  for (let y = 0; y < height; y += CHUNK_PX) {
    const buf = await page.screenshot({ fullPage: true, clip: { x: 0, y, width, height: Math.min(CHUNK_PX, height - y) }, animations: "disabled", caret: "hide" });
    parts.push(PNG.sync.read(buf));
  }
  fs.writeFileSync(file, PNG.sync.write(stitchVertical(parts)));
}

async function newContext(browser: Browser, feature: Feature, vp: AuditViewport, theme: ThemeName, storageState: string | undefined): Promise<BrowserContext> {
  const t = feature.theme;
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    colorScheme: t?.method === "media" && theme !== "default" ? theme : "light",
    ...(storageState && { storageState }),
  });
  if (t?.method === "localStorage" && theme !== "default") {
    const value = theme === "dark" ? t.dark : t.light;
    await context.addInitScript(`try { localStorage.setItem(${JSON.stringify(t.key)}, ${JSON.stringify(value)}); } catch (e) {}`);
  }
  return context;
}

async function auditVariant(browser: Browser, feature: Feature, url: string, waitFor: string[], vp: AuditViewport, theme: ThemeName, storageState: string | undefined, shotFile: string, root: string): Promise<AuditVariant> {
  const v: AuditVariant = { viewport: vp.name, theme, console: [], page_errors: [], failed_requests: [], warnings: [] };
  const context = await newContext(browser, feature, vp, theme, storageState);
  try {
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") v.console.push({ type: m.type(), text: m.text().slice(0, 300) });
    });
    page.on("pageerror", (e) => v.page_errors.push(e.message.split("\n")[0]!.slice(0, 300)));
    page.on("response", (r) => {
      if (r.status() >= 400) v.failed_requests.push({ status: r.status(), url: publicUrl(r.url()) });
    });
    page.on("requestfailed", (r) => v.failed_requests.push({ status: null, url: publicUrl(r.url()), error: r.failure()?.errorText }));

    await openPage(page, url, waitFor, v.warnings);
    const pending = (await page.evaluate(LOAD_ALL_SRC)) as number;
    if (pending) v.warnings.push(`${pending} ảnh chưa tải xong sau 8 giây.`);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    v.final_url = publicUrl(page.url());
    if (trimSlash(page.url().split(/[?#]/)[0]!) !== trimSlash(url.split(/[?#]/)[0]!)) {
      v.warnings.push(`Bị chuyển hướng tới ${v.final_url}. Nếu là trang đăng nhập: nhờ tester chạy lại lệnh login.`);
    }
    v.checks = (await page.evaluate(CHECKS_SRC)) as Record<string, unknown>;
    v.shown_theme = v.checks.shown_theme as string;
    if (theme !== "default" && v.shown_theme !== theme) {
      v.warnings.push(`Yêu cầu theme ${theme} nhưng trang hiển thị nền ${v.shown_theme}. Kiểm tra lại cấu hình theme trong feature.json.`);
    }
    await fullPageShot(page, shotFile);
    v.screenshot = rel(root, shotFile);
    // Ảnh toàn trang không cho thấy phần tử cố định (nút nổi, header dính) đè lên nội dung. Chụp thêm màn đầu và màn cuối.
    const base = shotFile.replace(/\.png$/, "");
    await page.screenshot({ path: `${base}-top.png`, animations: "disabled", caret: "hide" });
    await page.evaluate("scrollTo(0, document.documentElement.scrollHeight)");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${base}-bottom.png`, animations: "disabled", caret: "hide" });
    v.viewport_shots = [`${base}-top.png`, `${base}-bottom.png`].map((f) => rel(root, f));
  } catch (err) {
    v.warnings.push(`Lỗi khi kiểm tra: ${(err as Error).message.split("\n")[0]}`);
  } finally {
    await context.close().catch(() => {});
  }
  return v;
}

async function toggleTest(browser: Browser, feature: Feature, url: string, waitFor: string[], vp: AuditViewport, storageState: string | undefined): Promise<AuditResult["theme_toggle"]> {
  const t = feature.theme!;
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, colorScheme: "light", ...(storageState && { storageState }) });
  const read = async (page: Page) => (await page.evaluate(stateSrc(t))) as ThemeState;
  const empty: ThemeState = { shown_theme: "", stored: null, toggle_label: null };
  try {
    const page = await context.newPage();
    await openPage(page, url, waitFor, []);
    const before = await read(page);
    await page.locator(t.toggle!).first().click({ timeout: 10_000 });
    await page.waitForTimeout(700);
    const after_click = await read(page);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(700);
    const after_reload = await read(page);
    return { before, after_click, after_reload, switched: after_click.shown_theme !== before.shown_theme, remembered: after_reload.shown_theme === after_click.shown_theme };
  } catch (err) {
    return { before: empty, after_click: empty, after_reload: empty, switched: false, remembered: false, error: (err as Error).message.split("\n")[0] };
  } finally {
    await context.close().catch(() => {});
  }
}

async function osDarkTest(browser: Browser, feature: Feature, url: string, waitFor: string[], vp: AuditViewport, storageState: string | undefined): Promise<AuditResult["os_dark_preference"]> {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, colorScheme: "dark", ...(storageState && { storageState }) });
  try {
    const page = await context.newPage();
    await openPage(page, url, waitFor, []);
    const s = (await page.evaluate(stateSrc(feature.theme!))) as ThemeState;
    return { shown_theme: s.shown_theme, follows_os: s.shown_theme === "dark" };
  } catch {
    return null;
  } finally {
    await context.close().catch(() => {});
  }
}

function defaultViewports(feature: Feature): AuditViewport[] {
  const desktop = { name: "desktop", ...feature.viewport };
  return feature.viewport.width <= MOBILE.width ? [desktop] : [desktop, MOBILE];
}

/** Kiểm tra giao diện từng screen theo theme và viewport. Ghi ảnh, ảnh ghép sáng và tối, `checks.json`. */
export async function auditScreens(opts: AuditOptions): Promise<AuditResult[]> {
  const root = opts.root ?? PROJECT_ROOT;
  const feature = readFeature(opts.feature, opts);
  const keys = opts.screens?.length ? opts.screens : Object.keys(feature.screens);
  if (!keys.length) throw new Error(`Tính năng ${opts.feature} chưa khai báo screen nào trong feature.json.`);
  const unknown = keys.filter((k) => !feature.screens[k]);
  if (unknown.length) throw new Error(`Screen không có trong feature.json: ${unknown.join(", ")}`);
  const viewports = opts.viewports?.length ? opts.viewports : defaultViewports(feature);
  const t = feature.theme;
  const themes: ThemeName[] = t && t.method !== "none" ? ["light", "dark"] : ["default"];

  const browser = await chromium.launch({ headless: resolveHeadless(opts.headed, opts) });
  const results: AuditResult[] = [];
  try {
    for (const key of keys) {
      const screen = feature.screens[key]!;
      const dir = path.join(opts.runDir, "ui-audit", key);
      fs.rmSync(path.join(dir, "shots"), { recursive: true, force: true });
      fs.rmSync(path.join(dir, "review"), { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
      const url = trimSlash(feature.baseURL) + screen.path;
      const result: AuditResult = { feature: feature.feature, screen: key, url, audited_at: localIso(), theme: t ?? null, viewports, variants: [], theme_toggle: null, os_dark_preference: null, review_images: [], warnings: [] };
      if (!t) result.warnings.push("feature.json chưa khai báo theme. Chỉ kiểm tra giao diện mặc định. Thêm trường theme để kiểm tra cả sáng và tối.");

      let storageState: string | undefined;
      if (screen.auth) {
        const state = authFile(opts.feature, opts);
        if (!fs.existsSync(state)) {
          result.warnings.push(`Thiếu ${rel(root, state)}. Nhờ tester chạy: npm run cli -- login --feature ${opts.feature}`);
          writeJsonAtomic(path.join(dir, "checks.json"), result);
          results.push(result);
          continue;
        }
        storageState = state;
      }

      for (const vp of viewports) {
        for (const theme of themes) {
          const file = path.join(dir, "shots", `${vp.name}-${theme}.png`);
          result.variants.push(await auditVariant(browser, feature, url, screen.wait_for, vp, theme, storageState, file, root));
        }
        const shot = (theme: ThemeName) => {
          const f = path.join(dir, "shots", `${vp.name}-${theme}.png`);
          return fs.existsSync(f) ? readPng(f) : null;
        };
        const left = shot(themes[0]!);
        if (left) {
          const files = writeSideBySideSegments(left, themes[1] ? shot(themes[1]) : null, path.join(dir, "review"), vp.name);
          result.review_images.push(...files.map((f) => rel(root, f)));
        }
      }
      if (t?.toggle) result.theme_toggle = await toggleTest(browser, feature, url, screen.wait_for, viewports[0]!, storageState);
      if (t && t.method !== "media" && t.method !== "none") result.os_dark_preference = await osDarkTest(browser, feature, url, screen.wait_for, viewports[0]!, storageState);
      writeJsonAtomic(path.join(dir, "checks.json"), result);
      results.push(result);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return results;
}

/** "1440x900" hoặc "tablet=768x1024" thành viewport. */
export function parseViewport(spec: string): AuditViewport {
  const m = /^(?:([a-z0-9_-]+)=)?(\d{3,4})x(\d{3,5})$/i.exec(spec.trim());
  if (!m) throw new Error(`Viewport không hợp lệ: "${spec}". Dạng: 1440x900 hoặc tablet=768x1024.`);
  const width = Number(m[2]);
  const height = Number(m[3]);
  return { name: m[1] ?? `${width}x${height}`, width, height };
}
