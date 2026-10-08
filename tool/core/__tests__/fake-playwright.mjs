#!/usr/bin/env node
// `playwright` giả cho test: in log, ghi playwright-results.json như reporter json thật, không mở trình duyệt.
// Điều khiển bằng tên spec: có "slow" thì chạy mãi, có "stubborn" thì chạy mãi và bỏ qua SIGTERM, có "fail" thì fail.
import fs from "node:fs";
import path from "node:path";

const [, , cmd, spec = ""] = process.argv;
const name = path.basename(spec) || "ALL.spec.ts";
console.log(`fake playwright ${cmd} ${spec} feature=${process.env.FEATURE}`);
console.log(`secret=${process.env.FAKE_SECRET ?? ""}`);
console.error("dòng stderr");

// `--update-snapshots`: tạo ảnh baseline như Playwright thật, tên lấy từ toHaveScreenshot('<tên>.png') trong spec.
if (process.argv.includes("--update-snapshots") && spec && !spec.includes("nosnap")) {
  for (const m of fs.readFileSync(spec, "utf8").matchAll(/toHaveScreenshot\(\s*['"`]([^'"`]+)['"`]/g)) {
    const out = path.join("tests", "__screenshots__", process.env.FEATURE, m[1]);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, "png");
  }
}

if (spec.includes("stubborn")) process.on("SIGTERM", () => console.log("bỏ qua SIGTERM"));
if (spec.includes("slow") || spec.includes("stubborn")) {
  console.log("đang chạy");
  setInterval(() => {}, 1000);
} else {
  const failed = spec.includes("fail");
  const report = {
    suites: [
      {
        title: name,
        file: name,
        suites: [],
        specs: [
          { title: `${name} - test`, file: name, ok: !failed, tests: [{ status: failed ? "unexpected" : "expected", results: [{ duration: 12, ...(failed && { error: { message: `Expected: "${process.env.FAKE_SECRET ?? ""}"` } }) }, { duration: 8 }] }] },
        ],
      },
    ],
  };
  fs.writeFileSync(path.join(process.env.EVIDENCE_DIR, "playwright-results.json"), JSON.stringify(report));
  process.exit(failed ? 1 : 0);
}
