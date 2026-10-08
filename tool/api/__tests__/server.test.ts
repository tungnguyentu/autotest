import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { CASE, FEATURE, setup, type TestEnv } from "./helpers.ts";

let t: TestEnv;
before(async () => {
  t = await setup();
});
after(() => t.cleanup());

const waitFor = async (cond: () => boolean | Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail("hết thời gian chờ");
};

describe("tính năng", () => {
  it("liệt kê, tạo mới đúng schema, từ chối trùng và tên sai", async () => {
    let r = await t.call("GET", "/api/features");
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].feature, "demo");

    r = await t.call("POST", "/api/features", { feature: "moi", service: "Mới", baseURL: "https://moi.example.com", viewport: { width: 1440, height: 900 } });
    assert.equal(r.status, 201);
    const file = path.join(t.root, "features", "moi", "feature.json");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).screens, {});
    assert.ok(fs.existsSync(path.join(t.root, "features", "moi", "usecases")));

    assert.equal((await t.call("POST", "/api/features", { feature: "moi", service: "x", baseURL: "https://a.example.com", viewport: { width: 1, height: 1 } })).status, 409);
    assert.equal((await t.call("POST", "/api/features", { feature: "moi_r2", service: "x", baseURL: "https://a.example.com", viewport: { width: 1, height: 1 } })).status, 400);
    assert.ok(!fs.existsSync(path.join(t.root, "features", "moi_r2")));
    assert.equal((await t.call("POST", "/api/features", { feature: "../x", service: "x", baseURL: "https://a.example.com", viewport: { width: 1, height: 1 } })).status, 400);
    assert.equal((await t.call("POST", "/api/features", { feature: "x", service: "x", baseURL: "không-phải-url", viewport: { width: 1, height: 1 } })).status, 400);
  });

  it("PUT cập nhật cấu hình, không đổi tên và từ chối dữ liệu sai", async () => {
    let r = await t.call("PUT", "/api/features/demo", { ...FEATURE, service: "Demo 2" });
    assert.equal(r.status, 200);
    assert.equal((await t.call("GET", "/api/features/demo")).body.service, "Demo 2");
    assert.equal((await t.call("PUT", "/api/features/demo", { ...FEATURE, feature: "khac" })).status, 400);
    assert.equal((await t.call("PUT", "/api/features/demo", { ...FEATURE, viewport: { width: 0, height: 1 } })).status, 400);
    assert.equal((await t.call("PUT", "/api/features/khong-co", { ...FEATURE, feature: "khong-co" })).status, 404);
  });
});

describe("use case", () => {
  it("tải lên Markdown, không ghi đè, từ chối tên có đường dẫn", async () => {
    let r = await t.call("POST", "/api/features/demo/usecases", { name: "uc-dang-nhap.md", content: "# UC\nNội dung" });
    assert.equal(r.status, 201);
    assert.equal(r.body[0].name, "uc-dang-nhap.md");
    assert.equal(fs.readFileSync(path.join(t.root, "features", "demo", "usecases", "uc-dang-nhap.md"), "utf8"), "# UC\nNội dung");
    assert.equal((await t.call("POST", "/api/features/demo/usecases", { name: "uc-dang-nhap.md", content: "khác" })).status, 409);
    for (const name of ["../x.md", "a/b.md", "x.txt", ".md", "..md"]) {
      assert.equal((await t.call("POST", "/api/features/demo/usecases", { name, content: "x" })).status, 400, name);
    }
    assert.equal((await t.call("POST", "/api/features/demo/usecases", { name: "rong.md", content: "  " })).status, 400);
  });
});

describe("đợt test và summary", () => {
  it("tạo đợt không bao giờ trùng, liệt kê, sinh và sửa summary giữ kết luận", async () => {
    const a = await t.call("POST", "/api/features/demo/runs");
    const b = await t.call("POST", "/api/features/demo/runs");
    assert.equal(a.status, 201);
    assert.notEqual(a.body.name, b.body.name);
    assert.match(b.body.name, /_demo_r2$/);

    const list = await t.call("GET", "/api/features/demo/runs");
    assert.equal(list.body[0].name, b.body.name);
    assert.equal(list.body.length, 2);

    const base = `/api/features/demo/runs/${a.body.name}`;
    let r = await t.call("GET", base);
    assert.equal(r.status, 200);
    assert.equal(r.body.summary.exists, false);
    assert.ok(!fs.existsSync(path.join(t.root, "evidence", a.body.name, "summary.md")), "GET không được ghi file");

    r = await t.call("PUT", `${base}/summary`, { conclusion: "Đạt", tester: "Lan" });
    assert.equal(r.status, 200);
    assert.equal(r.body.conclusion, "Đạt");
    r = await t.call("POST", `${base}/summary/generate`);
    assert.equal(r.body.conclusion, "Đạt");
    assert.equal(r.body.front.tester, "Lan");
  });

  it("từ chối tên đợt thoát khỏi evidence hoặc của tính năng khác", async () => {
    for (const run of ["..%2F..", "2026-10-07_khac", "x"]) {
      const r = await t.call("GET", `/api/features/demo/runs/${run}`);
      assert.equal(r.status, 400, run);
    }
    assert.equal((await t.call("GET", "/api/features/demo/runs/2020-01-01_demo")).status, 404);
  });
});

describe("tính năng không tồn tại", () => {
  it("tạo đợt và chạy Playwright cho tính năng chưa có trả 404, không để thư mục evidence mồ côi", async () => {
    assert.equal((await t.call("POST", "/api/features/ghost/runs")).status, 404);
    assert.equal((await t.call("POST", "/api/features/ghost/playwright/run", { run: "2026-10-07_ghost" })).status, 404);
    const evidence = path.join(t.root, "evidence");
    assert.deepEqual(fs.existsSync(evidence) ? fs.readdirSync(evidence).filter((n) => n.includes("ghost")) : [], []);
  });
});

describe("đăng nhập", () => {
  it("start -> save qua file cờ, chỉ một tiến trình mỗi feature, không lộ nội dung auth", async () => {
    assert.equal((await t.call("POST", "/api/features/demo/login/save")).status, 409);
    let r = await t.call("POST", "/api/features/demo/login/start");
    assert.equal(r.status, 202);
    assert.equal(r.body.running, true);
    assert.equal((await t.call("POST", "/api/features/demo/login/start")).status, 409);

    r = await t.call("POST", "/api/features/demo/login/save");
    assert.equal(r.status, 202);
    assert.ok(fs.existsSync(path.join(t.root, "auth", "demo.save")) || fs.existsSync(path.join(t.root, "auth", "demo.meta.json")));

    await waitFor(() => fs.existsSync(path.join(t.root, "auth", "demo.meta.json")), 20000);
    r = await t.call("GET", "/api/features/demo/login");
    assert.equal(r.body.session.saved_at, "2026-10-07T10:00:00+07:00");
    assert.equal(r.body.session.final_url, "https://demo.example.com/home");
    assert.ok(!JSON.stringify(r.body).includes("TOKEN-123"));

    const overview = await t.call("GET", "/api/features/demo/overview");
    assert.ok(!JSON.stringify(overview.body).includes("TOKEN-123"));
  });

  it("tiến trình login đã thoát thì mở lại được, đóng server dừng tiến trình còn chạy", async () => {
    await waitFor(async () => (await t.call("GET", "/api/features/demo/login")).body.running === false, 20000);
    const done = await t.call("GET", "/api/features/demo/login");
    assert.equal(done.body.exit_code, 0);
    assert.ok(done.body.log.some((l: string) => l.includes("fake login")));
    assert.equal((await t.call("POST", "/api/features/demo/login/start")).status, 202);
  });

  it("start với tính năng không có trả 404", async () => {
    assert.equal((await t.call("POST", "/api/features/khong-co/login/start")).status, 404);
  });
});

describe("bảo vệ", () => {
  it("từ chối Host lạ và Origin lạ khi ghi, không phục vụ file ngoài tool/ui", async () => {
    // fetch không cho đổi Host, dùng http.request.
    const hostStatus = await new Promise<number>((resolve, reject) => {
      http
        .get({ host: "127.0.0.1", port: t.server.port, path: "/api/features", headers: { Host: "evil.example.com" } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on("error", reject);
    });
    assert.equal(hostStatus, 403);
    assert.equal((await t.call("POST", "/api/features/demo/runs", undefined, { Origin: "https://evil.example.com" })).status, 403);
    // Cùng máy nhưng khác cổng (dịch vụ khác trên localhost) cũng bị chặn; đúng cổng của server thì qua.
    assert.equal((await t.call("POST", "/api/features/demo/runs", undefined, { Origin: "http://localhost:9999" })).status, 403);
    assert.equal((await t.call("POST", "/api/features/demo/runs", undefined, { Origin: "http://localhost" })).status, 403);
    assert.equal((await t.call("POST", "/api/features/khong-co/login/start", undefined, { Origin: `http://localhost:${t.server.port}` })).status, 404);
    for (const p of ["/package.json", "/features/demo/feature.json", "/auth/demo.json", "/.env"]) {
      const r = await t.call("GET", p);
      assert.equal(r.status, 404, p);
    }
    const home = await fetch(t.url + "/");
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Tool AI Testing/);
  });

  it("API không có trả JSON 404", async () => {
    const r = await t.call("GET", "/api/khong-co");
    assert.equal(r.status, 404);
    assert.ok(r.body.error);
  });
});

describe("SSE", () => {
  it("phát {path, type} khi testcases.json đổi, không gửi nội dung, bỏ qua .env", async () => {
    const res = await fetch(t.url + "/events");
    assert.match(res.headers.get("content-type") ?? "", /^text\/event-stream/);
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

    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(path.join(t.root, "features", "demo", ".env"), "SECRET=abc");
    fs.writeFileSync(path.join(t.root, "features", "demo", "testcases.json"), JSON.stringify([CASE, CASE].slice(0, 1)));
    await waitFor(() => buf.includes("testcases.json"));
    await new Promise((r) => setTimeout(r, 400));

    const events = [...buf.matchAll(/^data: (.*)$/gm)].map((m) => JSON.parse(m[1]!));
    const tc = events.find((e) => e.path === "features/demo/testcases.json");
    assert.ok(tc, buf);
    assert.deepEqual(Object.keys(tc).sort(), ["path", "type"]);
    assert.ok(!buf.includes(".env"), "không được báo file .env");
    assert.ok(!buf.includes("SECRET"));
    await reader.cancel();
    await pump;
  });

  it("phát sự kiện khi thư mục evidence được tạo sau lúc server chạy", async () => {
    const res = await fetch(t.url + "/events");
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
    await new Promise((r) => setTimeout(r, 200));
    fs.mkdirSync(path.join(t.root, "evidence", "2026-01-01_demo", "ai-run"), { recursive: true });
    fs.writeFileSync(path.join(t.root, "evidence", "2026-01-01_demo", "ai-run", "X.json"), "{}");
    await waitFor(() => buf.includes("evidence/2026-01-01_demo/ai-run/X.json"), 3000);
    await reader.cancel();
    await pump;
  });
});
