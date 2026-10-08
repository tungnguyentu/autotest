import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readSettings, resolveHeadless, writeSettings } from "../settings.ts";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "settings-"));

describe("cài đặt headless", () => {
  it("chưa có file thì mặc định chạy ẩn", () => {
    const root = tmp();
    assert.equal(readSettings({ root }).playwright.headless, true);
    assert.equal(resolveHeadless(undefined, { root, env: {} }), true);
  });

  it("file đặt headless false thì mở cửa sổ, ghi lại được", () => {
    const root = tmp();
    writeSettings({ playwright: { headless: false } }, { root });
    assert.equal(resolveHeadless(undefined, { root, env: {} }), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "settings.local.json"), "utf8")), { playwright: { headless: false } });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "agent-browser.json"), "utf8")), { headed: true });
    fs.writeFileSync(path.join(root, "agent-browser.json"), JSON.stringify({ headed: true, hideScrollbars: false }));
    writeSettings({ playwright: { headless: true } }, { root });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "agent-browser.json"), "utf8")), { headed: false, hideScrollbars: false });
  });

  it("thứ tự ưu tiên: cờ dòng lệnh > HEADLESS > file", () => {
    const root = tmp();
    writeSettings({ playwright: { headless: false } }, { root });
    assert.equal(resolveHeadless(undefined, { root, env: { HEADLESS: "true" } }), true);
    assert.equal(resolveHeadless(false, { root, env: { HEADLESS: "true" } }), true);
    assert.equal(resolveHeadless(true, { root, env: { HEADLESS: "1" } }), false);
    assert.equal(resolveHeadless(undefined, { root, env: { HEADLESS: "" } }), false);
  });

  it("giá trị sai thì báo lỗi rõ", () => {
    const root = tmp();
    assert.throws(() => resolveHeadless(undefined, { root, env: { HEADLESS: "maybe" } }), /HEADLESS="maybe"/);
    fs.writeFileSync(path.join(root, "settings.local.json"), '{"playwright":{"headless":"no"}}');
    assert.throws(() => readSettings({ root }), /sai cấu trúc/);
    fs.writeFileSync(path.join(root, "settings.local.json"), "{");
    assert.throws(() => readSettings({ root }), /không phải JSON/);
  });
});
