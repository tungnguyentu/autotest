import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { CASE, setup, type TestEnv } from "./helpers.ts";

let t: TestEnv;
before(async () => {
  t = await setup();
});
after(() => t.cleanup());

const RUN = "2026-10-07_demo";
const p = (...parts: string[]) => path.join(t.root, ...parts);

describe("tiến độ test case trong overview (nguồn của ô Bước tiếp theo)", () => {
  it("ai-run chưa có kết quả thì has_result=false; spec sửa sau lần chạy thì spec_result=null", async () => {
    fs.writeFileSync(p("features", "demo", "testcases.json"), JSON.stringify([{ ...CASE, status: "reviewed" }, { ...CASE, id: "TC_DEMO_002", status: "ai-passed" }]));
    fs.mkdirSync(p("evidence", RUN, "ai-run"), { recursive: true });
    const aiRun = (id: string, result: unknown) =>
      JSON.stringify({ id, feature: "demo", baseURL: "https://demo.example.com", viewport: { width: 1, height: 1 }, started_at: "2026-10-07T10:00:00+07:00", steps: [], ai_result: result });
    fs.writeFileSync(p("evidence", RUN, "ai-run", "TC_DEMO_001.json"), aiRun("TC_DEMO_001", null));
    fs.mkdirSync(p("tests", "demo"), { recursive: true });
    const spec = p("tests", "demo", "TC_DEMO_002.spec.ts");
    fs.writeFileSync(spec, "");
    const finished = new Date(Date.now() + 60_000);
    fs.writeFileSync(
      p("evidence", RUN, "playwright-last.json"),
      JSON.stringify({
        feature: "demo",
        spec: null,
        exit_code: 0,
        stopped: false,
        started_at: "2026-10-07T10:00:00+07:00",
        finished_at: finished.toISOString(),
        tests: [{ file: "TC_DEMO_002.spec.ts", title: "x", status: "passed", duration_ms: 1 }],
      }),
    );
    const cases = async () => (await t.call("GET", "/api/features/demo/overview")).body.cases as any[];

    let c = await cases();
    assert.equal(c.find((x) => x.id === "TC_DEMO_001").ai_run.has_result, false);
    assert.equal(c.find((x) => x.id === "TC_DEMO_002").spec_result, "passed");

    // Spec bị sửa sau lần chạy: kết quả pass không còn nói về spec hiện tại, "automate" sẽ trả 409.
    const later = new Date(finished.getTime() + 60_000);
    fs.utimesSync(spec, later, later);
    c = await cases();
    assert.equal(c.find((x) => x.id === "TC_DEMO_002").spec_result, null);
  });
});
