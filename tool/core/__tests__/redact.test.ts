import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadSecrets, redact, redactText } from "../redact.ts";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "redact-test-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("redactText", () => {
  it("thay giá trị dài từ 3 ký tự bằng <secret:KEY>, bỏ qua giá trị ngắn hơn", () => {
    const secrets = { USER_PASSWORD: "abc123xyz", PIN: "12", CODE: "abc" };
    assert.equal(redactText("pw=abc123xyz pin=12 code=abc", secrets), "pw=<secret:USER_PASSWORD> pin=12 code=<secret:CODE>");
  });

  it("thay giá trị dài trước để giá trị chứa trong giá trị khác không để lộ phần còn lại", () => {
    const secrets = { SHORT: "secret", LONG: "secret-token-99" };
    assert.equal(redactText("x secret-token-99 y", secrets), "x <secret:LONG> y");
  });

  it("thay mọi lần xuất hiện và không hiểu nhầm ký tự đặc biệt của regex", () => {
    assert.equal(redactText("a.*+b a.*+b", { K: "a.*+b" }), "<secret:K> <secret:K>");
  });
});

describe("redact", () => {
  it("che đệ quy trong object và mảng, giữ nguyên số, null và khóa", () => {
    const secrets = { USER_PASSWORD: "abc123xyz" };
    const data = { n: 1, value: "abc123xyz", nil: null, nested: { list: ["ok", "pw abc123xyz!"], abc123xyz: "key giữ nguyên" } };
    assert.deepEqual(redact(data, secrets), {
      n: 1,
      value: "<secret:USER_PASSWORD>",
      nil: null,
      nested: { list: ["ok", "pw <secret:USER_PASSWORD>!"], abc123xyz: "key giữ nguyên" },
    });
    assert.equal(data.value, "abc123xyz", "không sửa đối tượng gốc");
  });
});

describe("loadSecrets", () => {
  it("chưa có .env thì trả về object rỗng", () => {
    assert.deepEqual(loadSecrets("demo", { root }), {});
  });

  it("đọc .env có nháy và chú thích", () => {
    fs.mkdirSync(path.join(root, "features", "demo"), { recursive: true });
    fs.writeFileSync(path.join(root, "features", "demo", ".env"), '# ghi chú\nUSER_EMAIL=a@b.vn\nUSER_PASSWORD="abc 123"\n');
    assert.deepEqual(loadSecrets("demo", { root }), { USER_EMAIL: "a@b.vn", USER_PASSWORD: "abc 123" });
  });
});
