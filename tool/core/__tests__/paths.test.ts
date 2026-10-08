import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  SENSITIVE_PATHS,
  assertFeatureName,
  createRunDir,
  evidenceRoot,
  isSensitivePath,
  publicUrl,
  resolveUserPath,
  nextRunDir,
  runName,
} from "../paths.ts";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "paths-test-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const opts = () => ({ root, date: "2026-10-07", env: {} as NodeJS.ProcessEnv });

describe("evidenceRoot", () => {
  it("mặc định là ./evidence trong gốc project", () => {
    assert.equal(evidenceRoot(opts()), path.join(root, "evidence"));
  });
  it("đọc EVIDENCE_ROOT", () => {
    const ext = path.join(root, "disk2");
    assert.equal(evidenceRoot({ root, env: { EVIDENCE_ROOT: ext } }), ext);
  });
  it("bỏ qua EVIDENCE_ROOT rỗng", () => {
    assert.equal(evidenceRoot({ root, env: { EVIDENCE_ROOT: "  " } }), path.join(root, "evidence"));
  });
});

describe("runName", () => {
  it("lần đầu không có hậu tố, các lần sau là _rN", () => {
    assert.equal(runName("staging", 1, "2026-10-07"), "2026-10-07_staging");
    assert.equal(runName("staging", 2, "2026-10-07"), "2026-10-07_staging_r2");
    assert.equal(runName("staging", 3, "2026-10-07"), "2026-10-07_staging_r3");
  });
});

describe("createRunDir", () => {
  it("tăng _r2, _r3 và không bao giờ trả về thư mục đã có", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const dir = createRunDir("staging", opts());
      assert.ok(!seen.has(dir), `trùng ${dir}`);
      seen.add(dir);
      assert.ok(fs.statSync(dir).isDirectory());
    }
    const names = [...seen].map((d) => path.basename(d));
    assert.deepEqual(names, [
      "2026-10-07_staging",
      "2026-10-07_staging_r2",
      "2026-10-07_staging_r3",
      "2026-10-07_staging_r4",
    ]);
  });
  it("không đụng vào nội dung thư mục cũ", () => {
    const first = createRunDir("staging", opts());
    fs.writeFileSync(path.join(first, "keep.txt"), "x");
    createRunDir("staging", opts());
    assert.equal(fs.readFileSync(path.join(first, "keep.txt"), "utf8"), "x");
  });
  it("tính riêng theo tính năng và theo ngày", () => {
    assert.equal(path.basename(createRunDir("a", opts())), "2026-10-07_a");
    assert.equal(path.basename(createRunDir("b", opts())), "2026-10-07_b");
    assert.equal(path.basename(createRunDir("a", { ...opts(), date: "2026-10-08" })), "2026-10-08_a");
  });
});

describe("nextRunDir", () => {
  it("không tạo thư mục và bỏ qua thư mục đã có", () => {
    const first = nextRunDir("staging", opts());
    assert.ok(!fs.existsSync(first));
    fs.mkdirSync(first, { recursive: true });
    assert.equal(path.basename(nextRunDir("staging", opts())), "2026-10-07_staging_r2");
  });
});

describe("assertFeatureName", () => {
  it("chấp nhận tên hợp lệ", () => {
    assert.equal(assertFeatureName("staging"), "staging");
    assert.equal(assertFeatureName("billing_v2-test"), "billing_v2-test");
  });
  it("từ chối tên có thể thoát khỏi thư mục", () => {
    for (const bad of ["", "../auth", "a/b", ".env", "a b"]) {
      assert.throws(() => assertFeatureName(bad), /không hợp lệ/);
    }
  });

  it("từ chối tên kết thúc bằng _r<số>, vì trùng tên đợt vòng N của tính năng khác", () => {
    for (const bad of ["foo_r2", "foo_R10", "staging_r1"]) assert.throws(() => assertFeatureName(bad), /_r<số>/, bad);
    for (const ok of ["staging", "foo_r", "foo_r2x", "r2", "foo_round2", "foo-r2"]) assert.equal(assertFeatureName(ok), ok);
  });
});

describe("đường dẫn không sao chép, không in", () => {
  it("liệt kê features/*/.env và auth/", () => {
    assert.deepEqual([...SENSITIVE_PATHS], ["features/*/.env", "auth/"]);
  });
  it("nhận diện file nhạy cảm", () => {
    assert.ok(isSensitivePath("features/staging/.env"));
    assert.ok(isSensitivePath("auth/staging.json"));
    assert.ok(isSensitivePath("./auth/staging.meta.json"));
    assert.ok(isSensitivePath("auth"));
  });
  it("chặn cả biến thể .env.<tên> của tính năng", () => {
    assert.ok(isSensitivePath("features/staging/.env.local"));
  });
  it("resolveUserPath: chỉ nhận đường dẫn trong vùng cho phép, từ chối .env, auth/ và symlink thoát ra ngoài", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "user-path-"));
    try {
      fs.mkdirSync(path.join(root, "features", "demo"), { recursive: true });
      fs.mkdirSync(path.join(root, "auth"));
      fs.mkdirSync(path.join(root, "evidence", "run"), { recursive: true });
      fs.writeFileSync(path.join(root, "features", "demo", ".env"), "A=1");
      fs.writeFileSync(path.join(root, "ok.json"), "{}");
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
      fs.symlinkSync(outside, path.join(root, "evidence", "run", "link"));
      const inRoot = (x: string) => resolveUserPath(x, "--f", [root], { root });
      assert.equal(inRoot("ok.json"), path.join(root, "ok.json"));
      assert.equal(inRoot("evidence/run/new.json"), path.join(root, "evidence", "run", "new.json")); // chưa tồn tại vẫn được
      assert.throws(() => inRoot("features/demo/.env"), /nhạy cảm/);
      assert.throws(() => inRoot("auth/demo.json"), /nhạy cảm/);
      assert.throws(() => inRoot("../etc/passwd"), /phải nằm trong/);
      assert.throws(() => resolveUserPath("evidence/run/link/x", "--f", [path.join(root, "evidence")], { root }), /phải nằm trong/);
      fs.rmSync(outside, { recursive: true, force: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("publicUrl bỏ query và fragment", () => {
    assert.equal(publicUrl("https://app.example.com/cb?code=SECRET&state=x#token=abc"), "https://app.example.com/cb");
    assert.equal(publicUrl("https://app.example.com:8443/a/b/"), "https://app.example.com:8443/a/b/");
    assert.equal(publicUrl("không phải url"), "");
  });
  it("không chặn nhầm file thường", () => {
    assert.ok(!isSensitivePath("features/staging/feature.json"));
    assert.ok(!isSensitivePath("features/staging/usecases/auth.md"));
    assert.ok(!isSensitivePath("authors/x.json"));
  });
});
