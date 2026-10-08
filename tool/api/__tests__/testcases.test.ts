import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { CASE, setup, type TestEnv } from "./helpers.ts";

let t: TestEnv;
const tcPath = () => path.join(t.root, "features", "demo", "testcases.json");
const seed = (list: unknown[]) => fs.writeFileSync(tcPath(), JSON.stringify(list));
const onDisk = () => JSON.parse(fs.readFileSync(tcPath(), "utf8")) as { id: string; status: string; title: string }[];

before(async () => {
  t = await setup();
});
after(() => t.cleanup());

describe("API test case", () => {
  it("chưa có file thì trả danh sách rỗng", async () => {
    const r = await t.call("GET", "/api/features/demo/testcases");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { testcases: [] });
  });

  it("PATCH đổi draft -> reviewed -> draft và ghi đúng schema", async () => {
    seed([CASE]);
    let r = await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { status: "reviewed" });
    assert.equal(r.status, 200);
    assert.equal(onDisk()[0]!.status, "reviewed");
    r = await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { status: "draft" });
    assert.equal(r.status, 200);
    assert.equal(onDisk()[0]!.status, "draft");
  });

  it("PATCH từ chối trạng thái không thuộc bước duyệt", async () => {
    seed([CASE]);
    for (const status of ["automated", "ai-passed", "ai-failed"]) {
      const r = await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { status });
      assert.equal(r.status, 409, status);
    }
    assert.equal(onDisk()[0]!.status, "draft");
  });

  it("PATCH không đổi được trạng thái đã do bước khác đặt", async () => {
    seed([{ ...CASE, status: "automated" }]);
    const r = await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { status: "draft" });
    assert.equal(r.status, 409);
    assert.equal(onDisk()[0]!.status, "automated");
  });

  it("PATCH sửa nội dung và từ chối dữ liệu sai schema hoặc trường lạ", async () => {
    seed([CASE]);
    let r = await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { title: "Tiêu đề mới", steps: ["a", "b"], priority: "Low" });
    assert.equal(r.status, 200);
    assert.equal(onDisk()[0]!.title, "Tiêu đề mới");
    r = await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { steps: [] });
    assert.equal(r.status, 400);
    r = await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { priority: "Urgent" });
    assert.equal(r.status, 400);
    r = await t.call("PATCH", "/api/features/demo/testcases/TC_DEMO_001", { id: "X" });
    assert.equal(r.status, 400);
    assert.equal(onDisk()[0]!.title, "Tiêu đề mới");
  });

  it("PATCH id không có trả 404", async () => {
    seed([CASE]);
    const r = await t.call("PATCH", "/api/features/demo/testcases/NOPE", { status: "reviewed" });
    assert.equal(r.status, 404);
  });

  it("PUT thay danh sách: test case mới phải là draft, id trùng bị từ chối", async () => {
    seed([CASE]);
    let r = await t.call("PUT", "/api/features/demo/testcases", [CASE, { ...CASE, id: "TC_DEMO_002", status: "reviewed" }]);
    assert.equal(r.status, 400);
    r = await t.call("PUT", "/api/features/demo/testcases", [CASE, { ...CASE, id: "TC_DEMO_002" }]);
    assert.equal(r.status, 200);
    assert.equal(onDisk().length, 2);
    r = await t.call("PUT", "/api/features/demo/testcases", [CASE, CASE]);
    assert.equal(r.status, 400);
    assert.equal(onDisk().length, 2);
  });

  it("PUT không xóa test case ngoài draft/reviewed và không đổi trạng thái tắt", async () => {
    seed([CASE, { ...CASE, id: "TC_DEMO_002", status: "ai-passed" }]);
    let r = await t.call("PUT", "/api/features/demo/testcases", [CASE]);
    assert.equal(r.status, 409);
    r = await t.call("PUT", "/api/features/demo/testcases", [CASE, { ...CASE, id: "TC_DEMO_002", status: "automated" }]);
    assert.equal(r.status, 409);
    assert.equal(onDisk().length, 2);
  });

  it("tên tính năng sai không lọt vào đường dẫn", async () => {
    const r = await t.call("GET", "/api/features/..%2Fetc/testcases");
    assert.equal(r.status, 400);
  });
});
