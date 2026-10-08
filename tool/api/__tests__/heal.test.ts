import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { setup, type TestEnv } from "./helpers.ts";

const FAKE_PW = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "core", "__tests__", "fake-playwright.mjs");
const RUN = "2026-10-07_demo";

let t: TestEnv;
const p = (...parts: string[]) => path.join(t.root, ...parts);
const SPEC_FILE = () => p("tests", "demo", "TC_heal.spec.ts");
const SPEC = "test('TC_heal', async ({ page }) => {\n  await page.getByRole('link', { name: 'Learn moar' }).click();\n  await expect(page).toHaveURL(/x/);\n});\n";
const GOOD = "@@ -1,3 +1,3 @@\n test('TC_heal', async ({ page }) => {\n-  await page.getByRole('link', { name: 'Learn moar' }).click();\n+  await page.getByRole('link', { name: 'Learn more' }).click();\n   await expect(page).toHaveURL(/x/);\n";
const BAD = "@@ -1,3 +1,3 @@\n test('TC_heal', async ({ page }) => {\n   await page.getByRole('link', { name: 'Learn moar' }).click();\n-  await expect(page).toHaveURL(/x/);\n+  await expect(page).toHaveURL(/y/);\n";

function seed(diff: string | null) {
  fs.rmSync(p("evidence", RUN), { recursive: true, force: true });
  fs.mkdirSync(p("evidence", RUN, "heal"), { recursive: true });
  fs.mkdirSync(p("tests", "demo"), { recursive: true });
  fs.writeFileSync(SPEC_FILE(), SPEC);
  if (diff !== null) fs.writeFileSync(p("evidence", RUN, "heal", "TC_heal.diff"), diff);
  fs.writeFileSync(p("evidence", RUN, "heal", "TC_heal.md"), "Lý do: đổi tên link.");
}

before(async () => {
  t = await setup({ env: { ...process.env, PLAYWRIGHT_BIN: FAKE_PW }, killGraceMs: 300 });
});
after(() => t.cleanup());

describe("API healing", () => {
  it("GET trả diff và lý do, null khi chưa có, từ chối id lạ", async () => {
    seed(GOOD);
    const r = await t.call("GET", `/api/runs/${RUN}/heal/TC_heal`);
    assert.equal(r.status, 200);
    assert.equal(r.body.diff, GOOD);
    assert.match(r.body.reason, /đổi tên link/);
    assert.deepEqual(r.body.problems, []);
    assert.equal((await t.call("GET", `/api/runs/${RUN}/heal/TC_none`)).body.diff, null);
    assert.equal((await t.call("GET", `/api/runs/${RUN}/heal/..%2Fx`)).status, 400);
  });

  it("áp dụng: sao lưu, đổi spec, chạy lại và trả kết quả", async () => {
    seed(GOOD);
    const r = await t.call("POST", `/api/runs/${RUN}/heal/TC_heal/apply`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.passed, true);
    assert.equal(r.body.last.spec, "tests/demo/TC_heal.spec.ts");
    assert.match(fs.readFileSync(SPEC_FILE(), "utf8"), /Learn more/);
    assert.equal(fs.readFileSync(p("evidence", RUN, "heal", "TC_heal.spec.ts.bak"), "utf8"), SPEC);
    assert.ok(!JSON.stringify(r.body).includes(t.root));
  });

  it("áp lần hai không đè bản sao đầu tiên: .bak giữ spec gốc, .bak.2 giữ spec sau lần áp đầu", async () => {
    seed(GOOD);
    assert.equal((await t.call("POST", `/api/runs/${RUN}/heal/TC_heal/apply`, {})).status, 200);
    const afterFirst = fs.readFileSync(SPEC_FILE(), "utf8");
    // Lần hai: đưa diff về đúng spec hiện tại (đổi tiếp Learn more -> Learn all).
    fs.writeFileSync(p("evidence", RUN, "heal", "TC_heal.diff"), GOOD.replace("moar", "more").replace("more' }).click();\n   await", "all' }).click();\n   await"));
    const r = await t.call("POST", `/api/runs/${RUN}/heal/TC_heal/apply`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(fs.readFileSync(p("evidence", RUN, "heal", "TC_heal.spec.ts.bak"), "utf8"), SPEC);
    assert.equal(fs.readFileSync(p("evidence", RUN, "heal", "TC_heal.spec.ts.bak.2"), "utf8"), afterFirst);
    assert.equal(r.body.backup, `evidence/${RUN}/heal/TC_heal.spec.ts.bak.2`);
  });

  it("từ chối diff chạm expect(: 409, spec nguyên vẹn, không sao lưu", async () => {
    seed(BAD);
    const r = await t.call("POST", `/api/runs/${RUN}/heal/TC_heal/apply`, {});
    assert.equal(r.status, 409);
    assert.match(r.body.error, /expect/);
    assert.equal(fs.readFileSync(SPEC_FILE(), "utf8"), SPEC);
    assert.ok(!fs.existsSync(p("evidence", RUN, "heal", "TC_heal.spec.ts.bak")));
  });

  it("từ chối khi spec đã đổi khác diff, hoặc không có diff", async () => {
    seed(GOOD);
    fs.writeFileSync(SPEC_FILE(), SPEC.replace("moar", "khac"));
    assert.equal((await t.call("POST", `/api/runs/${RUN}/heal/TC_heal/apply`, {})).status, 409);
    seed(null);
    assert.equal((await t.call("POST", `/api/runs/${RUN}/heal/TC_heal/apply`, {})).status, 404);
  });
});
