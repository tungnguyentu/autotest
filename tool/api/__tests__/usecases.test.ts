import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { setup, type TestEnv } from "./helpers.ts";

let t: TestEnv;
const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", name));
const ucDir = () => path.join(t.root, "features", "demo", "usecases");

async function uploadDocx(name: string, body: Buffer) {
  const res = await fetch(`${t.url}/api/features/demo/usecases/docx?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

before(async () => {
  t = await setup();
});
after(() => t.cleanup());

describe("API use case", () => {
  it("tải .md lên rồi liệt kê, không ghi đè file cùng tên", async () => {
    let r = await t.call("POST", "/api/features/demo/usecases", { name: "uc-a.md", content: "# A" });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.map((u: any) => u.name), ["uc-a.md"]);
    r = await t.call("POST", "/api/features/demo/usecases", { name: "uc-a.md", content: "# B" });
    assert.equal(r.status, 409);
    assert.equal(fs.readFileSync(path.join(ucDir(), "uc-a.md"), "utf8"), "# A");
  });

  it("tải .docx: chuyển sang .md với bảng Markdown, tách ảnh, giữ file gốc", async () => {
    const name = "UC01 tạo đơn.docx";
    const r = await uploadDocx(name, fixture("uc01-tao-don.docx"));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.converted, "UC01 tạo đơn.md");
    assert.equal(r.body.images, 1);

    const md = fs.readFileSync(path.join(ucDir(), "UC01 tạo đơn.md"), "utf8");
    assert.match(md, /^# UC01 Tạo đơn hàng$/m);
    assert.match(md, /^\| Trường \| Bắt buộc \| Độ dài \|$/m);
    assert.match(md, /^\| Tên khách \| Có \| 1-100 \|$/m);
    assert.match(md, /Vui lòng nhập tên khách/);
    assert.match(md, /!\[Ảnh 1\]\(UC01%20t%E1%BA%A1o%20%C4%91%C6%A1n\.images\/01\.png\)/);

    assert.ok(fs.statSync(path.join(ucDir(), "UC01 tạo đơn.images", "01.png")).size > 0);
    assert.deepEqual(fs.readFileSync(path.join(ucDir(), name)), fixture("uc01-tao-don.docx"));

    const row = r.body.usecases.find((u: any) => u.name === "UC01 tạo đơn.md");
    assert.equal(row.source, name);
    assert.equal(row.images, 1);
  });

  it("tải lại .docx cùng tên thì trả 409, file cũ giữ nguyên", async () => {
    const mdPath = path.join(ucDir(), "UC01 tạo đơn.md");
    const before = fs.readFileSync(mdPath, "utf8");
    const r = await uploadDocx("UC01 tạo đơn.docx", fixture("uc01-tao-don.docx"));
    assert.equal(r.status, 409);
    assert.equal(fs.readFileSync(mdPath, "utf8"), before);
  });

  it("từ chối .docx trùng tên với .md có sẵn, không ghi gì", async () => {
    const r = await uploadDocx("uc-a.docx", fixture("uc01-tao-don.docx"));
    assert.equal(r.status, 409);
    assert.equal(fs.existsSync(path.join(ucDir(), "uc-a.docx")), false);
  });

  it("từ chối .docx rỗng nội dung, file hỏng, tên sai", async () => {
    let r = await uploadDocx("blank.docx", fixture("blank.docx"));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /không có nội dung/);
    r = await uploadDocx("hong.docx", Buffer.from("không phải file zip"));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Không đọc được/);
    r = await uploadDocx("../x.docx", fixture("uc01-tao-don.docx"));
    assert.equal(r.status, 400);
    r = await uploadDocx("x.doc", fixture("uc01-tao-don.docx"));
    assert.equal(r.status, 400);
    for (const f of ["blank.docx", "blank.md", "hong.docx", "hong.md"]) assert.equal(fs.existsSync(path.join(ucDir(), f)), false, f);
  });
});
