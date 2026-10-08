import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import type { Meta } from "../../core/schemas.ts";
import type { CaptureFn } from "../ui-diff.ts";
import { FEATURE, setup, type TestEnv } from "./helpers.ts";

const FAKE_PW = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "core", "__tests__", "fake-playwright.mjs");
const RUN = "2026-10-07_demo";

function solid(w: number, h: number, block?: { x: number; y: number; w: number; h: number }): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inBlock = block && x >= block.x && x < block.x + block.w && y >= block.y && y < block.y + block.h;
      const i = (y * w + x) * 4;
      png.data[i] = inBlock ? 220 : 255;
      png.data[i + 1] = inBlock ? 30 : 255;
      png.data[i + 2] = inBlock ? 30 : 255;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

let t: TestEnv;
let release: (() => void) | null = null;
let gate: Promise<void> | null = null;
const p = (...parts: string[]) => path.join(t.root, ...parts);
const runDir = () => p("evidence", RUN);
const shotDir = (screen: string) => path.join(runDir(), "ui-diff", screen);
const json = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

/** Thay Chromium: ghi actual.png có một khối đỏ, copy ảnh Figma nếu có, đúng như `captureScreens` thật. */
const fakeCapture: CaptureFn = async (opts) => {
  const metas: Meta[] = [];
  for (const key of opts.screens ?? []) {
    if (gate) await gate;
    const dir = path.join(opts.out, key);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "actual.png"), solid(160, 100, { x: 32, y: 32, w: 48, h: 32 }));
    const warnings: string[] = [];
    const figma = p("features", "demo", "figma", `${key}.png`);
    if (fs.existsSync(figma)) fs.copyFileSync(figma, path.join(dir, "figma.png"));
    else warnings.push(`Thiếu ảnh Figma: features/demo/figma/${key}.png`);
    const meta: Meta = {
      screen: key,
      captured_at: "2026-10-07T10:00:00+07:00",
      viewport: { width: 160, height: 100 },
      full_page: false,
      scale: 1,
      mask_boxes: [],
      warnings,
      ...(fs.existsSync(figma) && { figma_modified: "2026-10-06T09:00:00+07:00" }),
    };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta));
    metas.push(meta);
    await opts.onScreen?.(meta, dir);
  }
  return metas;
};

const waitFor = async (cond: () => boolean | Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail("hết thời gian chờ");
};
const idle = async () => (await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.running === null;

const REPORT = `# UI check - home

## Sai khác đề xuất

| # | Vùng | Hạng mục | Figma | Thực tế | Mức | Phân loại |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | region_01 | Kích thước | Nút cao ~48px | ~40px (ước lượng) | Trung bình | Sai khác thật |
| 2 | region_02 | Nội dung | "A \\| B" | "A" | Cao | Sai khác thật |
| 3 | region_03 | Màu | Xanh | Xanh nhạt | - | Có thể chấp nhận |

## Quyết định của tester
- [ ] UI khớp
`;

before(async () => {
  t = await setup({ env: { ...process.env, PLAYWRIGHT_BIN: FAKE_PW }, killGraceMs: 300, capture: fakeCapture });
  fs.writeFileSync(
    p("features", "demo", "feature.json"),
    JSON.stringify({ ...FEATURE, screens: { home: { path: "/", auth: false }, about: { path: "/about", auth: false } } }),
  );
});
after(() => t.cleanup());
beforeEach(() => {
  fs.rmSync(p("evidence"), { recursive: true, force: true });
  fs.rmSync(p("features", "demo", "figma"), { recursive: true, force: true });
  fs.rmSync(p("tests"), { recursive: true, force: true });
  fs.mkdirSync(runDir(), { recursive: true });
  gate = null;
});

const putFigma = (screen: string, block = { x: 32, y: 32, w: 48, h: 32 }) => {
  fs.mkdirSync(p("features", "demo", "figma"), { recursive: true });
  fs.writeFileSync(p("features", "demo", "figma", `${screen}.png`), solid(160, 100, block));
};
const runAll = async (body: object = {}) => {
  const r = await t.call("POST", "/api/features/demo/ui-diff/run", { run: RUN, ...body });
  if (r.status === 202) await waitFor(idle);
  return r;
};

describe("ui-diff: chụp và so", () => {
  it("chụp rồi so từng screen, screen thiếu Figma được báo chứ không bỏ qua âm thầm", async () => {
    putFigma("home", { x: 32, y: 32, w: 48, h: 16 }); // Figma khác thực tế ở nửa dưới của khối đỏ
    const r = await runAll();
    assert.equal(r.status, 202);
    assert.deepEqual(r.body.screens, ["home", "about"]);

    const view = (await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body;
    assert.equal(view.running, null);
    assert.deepEqual(view.feature_screens.map((s: any) => [s.key, s.has_figma]), [["home", true], ["about", false]]);
    const home = view.screens.find((s: any) => s.screen === "home");
    const about = view.screens.find((s: any) => s.screen === "about");
    assert.equal(home.metrics.total_regions, 1);
    assert.equal(home.metrics.regions[0].changed_px, 48 * 16);
    assert.ok(home.files.side_by_side && home.files.diff);
    assert.equal(home.meta.figma_modified, "2026-10-06T09:00:00+07:00");
    assert.equal(about.metrics, null);
    assert.ok(about.meta.warnings.some((w: string) => w.startsWith("Thiếu ảnh Figma")));
    assert.equal(about.files.actual, true);
    assert.ok(!fs.existsSync(path.join(shotDir("about"), "metrics.json")));
  });

  it("chỉ chụp screen được chọn, từ chối screen lạ, đợt lạ, và job thứ hai khi đang chạy", async () => {
    putFigma("home");
    let r = await runAll({ screens: ["home"] });
    assert.equal(r.status, 202);
    assert.ok(fs.existsSync(shotDir("home")) && !fs.existsSync(shotDir("about")));

    assert.equal((await t.call("POST", "/api/features/demo/ui-diff/run", { run: RUN, screens: ["nope"] })).status, 400);
    assert.equal((await t.call("POST", "/api/features/demo/ui-diff/run", { run: "2026-01-01_demo" })).status, 404);
    assert.equal((await t.call("POST", "/api/features/demo/ui-diff/run", {})).status, 400);

    gate = new Promise((res) => (release = res));
    r = await t.call("POST", "/api/features/demo/ui-diff/run", { run: RUN });
    assert.equal(r.status, 202);
    const busy = await t.call("POST", "/api/features/demo/ui-diff/run", { run: RUN });
    assert.equal(busy.status, 409);
    release?.();
    await waitFor(idle);
  });
});

describe("ui-diff: quyết định và baseline", () => {
  const seedScreen = async (spec: string | null = `import { test, expect } from "@playwright/test";\ntest("t", async ({ page }) => { await expect(page).toHaveScreenshot('home.png'); });\n`) => {
    putFigma("home", { x: 32, y: 32, w: 48, h: 16 });
    await runAll({ screens: ["home"] });
    if (spec) {
      fs.mkdirSync(p("tests", "demo"), { recursive: true });
      fs.writeFileSync(p("tests", "demo", "TC_DEMO_001.spec.ts"), spec);
    }
  };
  const decide = (items: object[]) => t.call("POST", `/api/runs/${RUN}/ui-diff/home/decisions`, { items });
  const fullDecisions = [
    { index: 1, decision: "accept", note: "đúng" },
    { index: 2, decision: "bug", note: "lệch" },
    { index: 3, decision: "review" },
  ];
  // Không còn mục bug: đủ điều kiện tạo baseline.
  const cleanDecisions = fullDecisions.map((d) => (d.decision === "bug" ? { ...d, decision: "accept" } : d));

  it("đọc bảng sai khác từ report.md, đếm theo mức, lưu quyết định", async () => {
    await seedScreen();
    assert.equal((await decide(fullDecisions)).status, 409); // chưa có report.md

    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    const view = (await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.screens[0];
    assert.equal(view.report.rows.length, 3);
    assert.equal(view.report.rows[1].figma, '"A | B"');
    assert.equal(view.report.rows[0].level, "Trung bình");
    assert.equal(view.report.stale, false);

    assert.equal((await decide([{ index: 4, decision: "accept" }])).status, 400);
    assert.equal((await decide([{ index: 1, decision: "accept" }, { index: 1, decision: "bug" }])).status, 400);
    assert.equal((await decide([{ index: 1, decision: "xong" }])).status, 400);

    const ok = await decide(fullDecisions);
    assert.equal(ok.status, 200);
    const saved = json(path.join(shotDir("home"), "decisions.json"));
    assert.equal(saved.items.length, 3);
    assert.equal(saved.items[1].decision, "bug");
    assert.match(saved.decided_at, /^\d{4}-\d{2}-\d{2}T.*[+-]\d{2}:\d{2}$/);
  });

  it("còn mục bug thì chặn baseline, đổi quyết định thì mở khóa", async () => {
    await seedScreen();
    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    await decide(fullDecisions);
    const r = await t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`);
    assert.equal(r.status, 409);
    assert.match(r.body.error, /Còn 1 mục đánh dấu Bug/);
    assert.ok(!fs.existsSync(path.join(shotDir("home"), "baseline.json")));
    await decide(cleanDecisions);
    assert.deepEqual((await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.screens[0].blockers, []);
  });

  it("từ chối baseline: không spec, chưa có report, chưa quyết định hết", async () => {
    await seedScreen(null);
    const call = () => t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`);
    let r = await call();
    assert.equal(r.status, 409);
    assert.match(r.body.error, /Chưa có spec/);
    assert.match(r.body.error, /report\.md/);

    fs.mkdirSync(p("tests", "demo"), { recursive: true });
    fs.writeFileSync(p("tests", "demo", "a.spec.ts"), `await expect(page).toHaveScreenshot("home.png");`);
    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    await decide([{ index: 1, decision: "accept" }]);
    r = await call();
    assert.equal(r.status, 409);
    assert.match(r.body.error, /còn 2 mục/);

    const view = (await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.screens[0];
    assert.equal(view.spec, "tests/demo/a.spec.ts");
    assert.equal(view.blockers.length, 1);
    assert.equal((await t.call("POST", `/api/runs/${RUN}/ui-diff/ghost/baseline`)).status, 404);
    assert.equal((await t.call("POST", `/api/runs/${RUN}/ui-diff/..%2Fx/baseline`)).status, 400);
  });

  it("report cũ hơn lần so gần nhất thì chưa cho baseline", async () => {
    await seedScreen();
    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    await decide(cleanDecisions);
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(shotDir("home"), "report.md"), past, past);
    const r = await t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`);
    assert.equal(r.status, 409);
    assert.match(r.body.error, /cũ hơn/);
  });

  it("đủ điều kiện: chạy spec với --update-snapshots, ghi baseline.json khi exit 0", async () => {
    await seedScreen();
    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    await decide(cleanDecisions);
    const r = await t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`);
    assert.equal(r.status, 202);
    assert.equal(r.body.spec, "tests/demo/TC_DEMO_001.spec.ts");

    const file = path.join(shotDir("home"), "baseline.json");
    await waitFor(() => fs.existsSync(file));
    const b = json(file);
    assert.equal(b.spec, "tests/demo/TC_DEMO_001.spec.ts");
    assert.equal(b.screenshot, "tests/__screenshots__/demo/home.png");
    assert.equal(b.figma_modified, "2026-10-06T09:00:00+07:00");
    assert.equal(b.run, RUN);
    assert.ok(fs.existsSync(p("tests", "__screenshots__", "demo", "home.png")));
    await waitFor(() => t.call("GET", "/api/features/demo/playwright").then((x) => x.body.running === null));
    // Playwright giả chỉ tạo ảnh khi nhận --update-snapshots, nên file ảnh ở trên chứng minh cờ đã được truyền.
    assert.equal((await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.screens[0].baseline.screenshot, "tests/__screenshots__/demo/home.png");
  });

  it("spec chạy xong nhưng không tạo ảnh thì không ghi baseline.json", async () => {
    await seedScreen(`await expect(page).toHaveScreenshot('home.png'); // nosnap`);
    fs.renameSync(p("tests", "demo", "TC_DEMO_001.spec.ts"), p("tests", "demo", "nosnap.spec.ts"));
    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    await decide(cleanDecisions);
    assert.equal((await t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`)).status, 202);
    await waitFor(() => t.call("GET", "/api/features/demo/playwright").then((x) => x.body.running === null));
    assert.ok(!fs.existsSync(path.join(shotDir("home"), "baseline.json")));
  });

  it("report.md đổi sau khi lưu quyết định thì quyết định cũ hết hiệu lực và baseline bị chặn", async () => {
    await seedScreen();
    const report = path.join(shotDir("home"), "report.md");
    fs.writeFileSync(report, REPORT);
    await decide(cleanDecisions);
    assert.ok(json(path.join(shotDir("home"), "decisions.json")).report_hash, "decisions.json phải ghi mã băm của report.md");
    let view = (await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.screens[0];
    assert.equal(view.decisions_stale, false);
    assert.deepEqual(view.blockers, []);

    // Chạy lại /ui-check: dòng 1 thành "Cao, Sai khác thật" nhưng vẫn là dòng số 1.
    fs.writeFileSync(report, REPORT.replace("| Trung bình | Sai khác thật |", "| Cao | Sai khác thật |").replace("Nút cao ~48px", "Nút Thanh toán"));
    view = (await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.screens[0];
    assert.equal(view.decisions_stale, true);
    assert.ok(view.blockers.some((b: string) => /report\.md đã đổi/.test(b)), view.blockers.join(" | "));
    const r = await t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`);
    assert.equal(r.status, 409);
    assert.match(r.body.error, /report\.md đã đổi/);
    const overview = (await t.call("GET", "/api/features/demo/overview")).body;
    assert.equal(overview.ui_diff.find((u: any) => u.screen === "home").undecided, 3);

    // Quyết định lại thì mở khóa.
    assert.equal((await decide(cleanDecisions)).status, 200);
    view = (await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.screens[0];
    assert.equal(view.decisions_stale, false);
    assert.deepEqual(view.blockers, []);
  });

  it("decisions.json cũ không có mã băm bị coi là đã cũ", async () => {
    await seedScreen();
    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    fs.writeFileSync(path.join(shotDir("home"), "decisions.json"), JSON.stringify({ items: fullDecisions, decided_at: "2026-10-07T10:00:00+07:00" }));
    const view = (await t.call("GET", `/api/runs/${RUN}/ui-diff`)).body.screens[0];
    assert.equal(view.decisions_stale, true);
    assert.equal((await t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`)).status, 409);
  });

  it("baseline một screen không ghi đè ảnh của screen khác: sao lưu trước, giữ nguyên sau", async () => {
    await seedScreen(`await expect(page).toHaveScreenshot('home.png');\nawait expect(page).toHaveScreenshot('about.png');\nawait expect(page).toHaveScreenshot('extra.png');`);
    const shots = p("tests", "__screenshots__", "demo");
    fs.mkdirSync(shots, { recursive: true });
    fs.writeFileSync(path.join(shots, "home.png"), "home-cu");
    fs.writeFileSync(path.join(shots, "about.png"), "about-cu");
    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    await decide(cleanDecisions);

    assert.equal((await t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`)).status, 202);
    const file = path.join(shotDir("home"), "baseline.json");
    await waitFor(() => fs.existsSync(file));
    await waitFor(() => t.call("GET", "/api/features/demo/playwright").then((x) => x.body.running === null));

    assert.equal(fs.readFileSync(path.join(shots, "home.png"), "utf8"), "png", "ảnh của screen đang duyệt được cập nhật");
    assert.equal(fs.readFileSync(path.join(shots, "about.png"), "utf8"), "about-cu", "ảnh của screen khác phải còn nguyên");
    assert.ok(!fs.existsSync(path.join(shots, "extra.png")), "ảnh mới của screen chưa duyệt không được giữ lại");

    const b = json(file);
    assert.match(b.backup, /^evidence\/2026-10-07_demo\/baseline-backup\/.+/);
    assert.equal(fs.readFileSync(path.join(t.root, b.backup, "home.png"), "utf8"), "home-cu", "bản sao giữ ảnh baseline cũ của chính screen");
    assert.equal(fs.readFileSync(path.join(t.root, b.backup, "about.png"), "utf8"), "about-cu");
  });

  it("chưa có ảnh baseline nào thì baseline.json ghi backup null", async () => {
    await seedScreen();
    fs.writeFileSync(path.join(shotDir("home"), "report.md"), REPORT);
    await decide(cleanDecisions);
    await t.call("POST", `/api/runs/${RUN}/ui-diff/home/baseline`);
    const file = path.join(shotDir("home"), "baseline.json");
    await waitFor(() => fs.existsSync(file));
    assert.equal(json(file).backup, null);
    await waitFor(() => t.call("GET", "/api/features/demo/playwright").then((x) => x.body.running === null));
  });
});
