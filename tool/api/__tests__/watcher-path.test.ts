import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { startServer } from "../../server.ts";

describe("watcher", () => {
  it("project nằm dưới thư mục tên test-results vẫn nhận sự kiện, còn test-results bên trong project thì bị bỏ qua", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "watch-"));
    const root = path.join(base, "test-results", "node_modules", "proj");
    fs.mkdirSync(path.join(root, "features"), { recursive: true });
    const server = await startServer({ root, port: 0, env: {}, debounceMs: 50 });
    const res = await fetch(`http://127.0.0.1:${server.port}/events`);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const pump = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value);
      }
    })().catch(() => {});
    try {
      await server.watcherReady;
      fs.mkdirSync(path.join(root, "evidence", "2026-10-07_demo", "test-results"), { recursive: true });
      fs.writeFileSync(path.join(root, "evidence", "2026-10-07_demo", "test-results", "noise.txt"), "x");
      // Ghi lại định kỳ: fsevents trên macOS có thể gộp hoặc trễ sự kiện của file vừa tạo khi máy đang tải nặng.
      const end = Date.now() + 8000;
      for (let n = 0; !buf.includes("features/marker.json") && Date.now() < end; n++) {
        if (n % 8 === 0) fs.writeFileSync(path.join(root, "features", "marker.json"), JSON.stringify({ n }));
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.ok(buf.includes("features/marker.json"), `không nhận được sự kiện: ${buf}`);
      assert.ok(!buf.includes("noise.txt"), "file trong test-results của đợt phải bị bỏ qua");
    } finally {
      await reader.cancel();
      await pump;
      await server.close();
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
