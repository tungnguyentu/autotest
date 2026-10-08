import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";
import { addDocxUsecase, addMarkdownUsecase, listUsecases, usecasesDir } from "../usecase-store.ts";

let root: string;
const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", name));
const dir = () => usecasesDir("demo", { root });

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "usecase-"));
  fs.mkdirSync(path.join(root, "features", "demo"), { recursive: true });
});

describe("use case", () => {
  it("thêm .md rồi liệt kê, không ghi đè file cùng tên", () => {
    addMarkdownUsecase("demo", "uc-a.md", "# A", { root });
    assert.deepEqual(listUsecases("demo", { root }).map((u) => u.name), ["uc-a.md"]);
    assert.throws(() => addMarkdownUsecase("demo", "uc-a.md", "# B", { root }), /Đã có/);
    assert.equal(fs.readFileSync(path.join(dir(), "uc-a.md"), "utf8"), "# A");
  });

  it(".docx: chuyển sang .md với bảng Markdown, tách ảnh, giữ file gốc", async () => {
    const name = "UC01 tạo đơn.docx";
    const r = await addDocxUsecase("demo", name, fixture("uc01-tao-don.docx"), { root });
    assert.equal(r.converted, "UC01 tạo đơn.md");
    assert.equal(r.images, 1);
    const md = fs.readFileSync(path.join(dir(), "UC01 tạo đơn.md"), "utf8");
    assert.match(md, /^# UC01 Tạo đơn hàng$/m);
    assert.match(md, /^\| Trường \| Bắt buộc \| Độ dài \|$/m);
    assert.match(md, /^\| Tên khách \| Có \| 1-100 \|$/m);
    assert.match(md, /!\[Ảnh 1\]\(UC01%20t%E1%BA%A1o%20%C4%91%C6%A1n\.images\/01\.png\)/);
    assert.ok(fs.statSync(path.join(dir(), "UC01 tạo đơn.images", "01.png")).size > 0);
    assert.deepEqual(fs.readFileSync(path.join(dir(), name)), fixture("uc01-tao-don.docx"));
    const row = listUsecases("demo", { root }).find((u) => u.name === "UC01 tạo đơn.md")!;
    assert.equal(row.source, name);
    assert.equal(row.images, 1);
  });

  it("thêm lại .docx cùng tên hoặc trùng tên .md có sẵn thì từ chối, không ghi gì", async () => {
    const before = fs.readFileSync(path.join(dir(), "UC01 tạo đơn.md"), "utf8");
    await assert.rejects(addDocxUsecase("demo", "UC01 tạo đơn.docx", fixture("uc01-tao-don.docx"), { root }), /Đã có/);
    assert.equal(fs.readFileSync(path.join(dir(), "UC01 tạo đơn.md"), "utf8"), before);
    await assert.rejects(addDocxUsecase("demo", "uc-a.docx", fixture("uc01-tao-don.docx"), { root }), /Đã có/);
    assert.equal(fs.existsSync(path.join(dir(), "uc-a.docx")), false);
  });

  it("từ chối .docx rỗng nội dung, file hỏng, tên sai", async () => {
    await assert.rejects(addDocxUsecase("demo", "blank.docx", fixture("blank.docx"), { root }), /không có nội dung/);
    await assert.rejects(addDocxUsecase("demo", "hong.docx", Buffer.from("không phải file zip"), { root }), /Không đọc được/);
    await assert.rejects(addDocxUsecase("demo", "../x.docx", fixture("uc01-tao-don.docx"), { root }), /Tên file/);
    await assert.rejects(addDocxUsecase("demo", "x.doc", fixture("uc01-tao-don.docx"), { root }), /Tên file/);
    for (const f of ["blank.docx", "blank.md", "hong.docx", "hong.md"]) assert.equal(fs.existsSync(path.join(dir(), f)), false, f);
  });
});
