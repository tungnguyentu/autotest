import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { PNG } from "pngjs";
import { parseFeature } from "../../core/schemas.ts";
import { stitchVertical, writeSideBySideSegments } from "../../core/png-tools.ts";
import { auditScreens, parseViewport, type AuditResult } from "../audit.ts";
import { featureInit } from "../feature-init.ts";

// Trang mẫu: theme lưu ở localStorage "mode", nút đổi theme, một nhãn tương phản thấp khi tối,
// không có H1, link không có href, rel viết sai, ảnh thiếu alt, trang cao hơn 16384px.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script>document.documentElement.dataset.theme = localStorage.getItem("mode") === "night" ? "dark" : "light";</script>
<style>
  body { margin: 0; font: 16px sans-serif; background: #fff; color: #111; }
  [data-theme=dark] body { background: #0b1020; color: #eee; }
  .tag { background: #e8edfb; color: #1d4ed8; font-size: 12px; }
  [data-theme=dark] .tag { color: #60a5fa; }
  a { color: inherit; }
  .tall { height: 18000px; }
  #call { position: fixed; left: 8px; bottom: 8px; width: 40px; height: 40px; }
</style></head><body>
<h2>Dịch vụ</h2>
<button id="toggle" aria-label="Đổi theme" onclick="const d=document.documentElement.dataset.theme==='dark';localStorage.setItem('mode', d?'day':'night');document.documentElement.dataset.theme=d?'light':'dark'">T</button>
<p><span class="tag">cafef.vn</span></p>
<a id="form">Điền form</a>
<a href="https://example.com" rel='rel="nofollow"'>Bài báo</a>
<img src="/dot.png">
<div class="tall"></div>
<button id="call" aria-label="Gọi">C</button>
<p>Cuối trang</p>
</body></html>`;

function dotPng(): Buffer {
  const p = new PNG({ width: 2, height: 2 });
  p.data.fill(120);
  return PNG.sync.write(p);
}

let server: http.Server;
let base: string;
let root: string;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/dot.png") return res.writeHead(200, { "Content-Type": "image/png" }).end(dotPng());
    if (req.url === "/missing") return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
});
after(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("feature.json: trường theme", () => {
  const feature = { feature: "x", service: "X", baseURL: "https://x.example.com", viewport: { width: 1440, height: 900 }, screens: { home: { path: "/" } } };

  it("không bắt buộc, có thì điền giá trị mặc định", () => {
    assert.equal(parseFeature(feature).theme, undefined);
    const t = parseFeature({ ...feature, theme: { method: "localStorage", key: "theme" } }).theme!;
    assert.deepEqual({ light: t.light, dark: t.dark }, { light: "light", dark: "dark" });
  });

  it("method localStorage thiếu key thì báo lỗi", () => {
    assert.throws(() => parseFeature({ ...feature, theme: { method: "localStorage" } }), /key/);
    assert.throws(() => parseFeature({ ...feature, theme: { method: "cookie", key: "t" } }));
  });
});

describe("ghép ảnh", () => {
  const solid = (w: number, h: number, v: number) => {
    const p = new PNG({ width: w, height: h });
    p.data.fill(v);
    return p;
  };

  it("ghép dọc giữ đủ chiều cao và thứ tự", () => {
    const out = stitchVertical([solid(10, 5, 10), solid(10, 7, 200)]);
    assert.equal(out.height, 12);
    assert.equal(out.data[0], 10);
    assert.equal(out.data[(11 * 10) * 4], 200);
    assert.throws(() => stitchVertical([solid(10, 5, 0), solid(9, 5, 0)]), /lệch chiều rộng/);
  });

  it("ảnh cạnh nhau được cắt đoạn và thu nhỏ không quá maxWidth", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seg-"));
    const files = writeSideBySideSegments(solid(1440, 5000, 255), solid(1440, 4000, 0), dir, "desktop");
    const first = PNG.sync.read(fs.readFileSync(files[0]!));
    assert.ok(first.width <= 1500, `rộng ${first.width}`);
    assert.equal(files.length, Math.ceil(5000 / Math.round(1000 * (2900 / 1500))));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("viewport dạng 1440x900 hoặc tên=WxH", () => {
    assert.deepEqual(parseViewport("tablet=768x1024"), { name: "tablet", width: 768, height: 1024 });
    assert.equal(parseViewport("390x844").name, "390x844");
    assert.throws(() => parseViewport("abc"), /không hợp lệ/);
  });
});

describe("feature-init và audit trên trang cục bộ", { timeout: 180_000 }, () => {
  let result: AuditResult;
  const runDir = () => path.join(root, "evidence", "run");

  it("feature-init tạo feature.json từ URL và không ghi đè", () => {
    const { feature } = featureInit({ feature: "local", url: `${base}/`, root });
    assert.equal(feature.baseURL, base);
    assert.equal(feature.screens.home!.path, "/");
    assert.throws(() => featureInit({ feature: "local", url: `${base}/`, root }), /Đã có/);
    const file = path.join(root, "features", "local", "feature.json");
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    json.theme = { method: "localStorage", key: "mode", light: "day", dark: "night", toggle: "#toggle" };
    fs.writeFileSync(file, JSON.stringify(json));
  });

  it("audit chụp đủ theme và viewport, đo đúng lỗi đã cài", async () => {
    result = (await auditScreens({ feature: "local", runDir: runDir(), root, viewports: [{ name: "desktop", width: 1024, height: 700 }, { name: "mobile", width: 390, height: 844 }] }))[0]!;
    assert.equal(result.variants.length, 4);
    for (const v of result.variants) {
      assert.deepEqual(v.warnings, [], `${v.viewport}/${v.theme}: ${v.warnings.join("; ")}`);
      assert.equal(v.shown_theme, v.theme);
      const c = v.checks as any;
      assert.equal(c.headings.h1.length, 0);
      assert.equal(c.links.no_target.length, 1);
      assert.equal(c.links.bad_rel.length, 1);
      assert.equal(c.images.missing_alt.length, 1);
      assert.ok(c.floating.some((f: any) => f.selector === "button#call"));
      assert.equal(c.contrast.failures, v.theme === "dark" ? 1 : 0, JSON.stringify(c.contrast.items));
    }
  });

  it("ảnh toàn trang đủ chiều cao kể cả khi trang cao hơn 16384px, có ảnh đầu và cuối trang", () => {
    const dir = path.join(runDir(), "ui-audit", "home");
    const shot = PNG.sync.read(fs.readFileSync(path.join(dir, "shots", "mobile-dark.png")));
    const height = (result.variants.find((v) => v.viewport === "mobile")!.checks as any).page.height;
    assert.ok(height > 16384);
    assert.equal(shot.height, height);
    for (const f of ["mobile-dark-top.png", "mobile-dark-bottom.png", "desktop-light.png"]) assert.ok(fs.existsSync(path.join(dir, "shots", f)), f);
    assert.ok(result.review_images.some((f) => f.endsWith("review/mobile-01.png")));
    assert.ok(result.review_images.some((f) => f.endsWith("review/desktop-01.png")));
    assert.ok(fs.existsSync(path.join(dir, "checks.json")));
  });

  it("nút đổi theme: đổi được và nhớ sau tải lại. Trang không theo theme của hệ điều hành", () => {
    const t = result.theme_toggle!;
    assert.equal(t.error, undefined);
    assert.equal(t.before.shown_theme, "light");
    assert.equal(t.after_click.shown_theme, "dark");
    assert.equal(t.after_click.stored, "night");
    assert.equal(t.switched, true);
    assert.equal(t.remembered, true);
    assert.deepEqual(result.os_dark_preference, { shown_theme: "light", follows_os: false });
  });
});
