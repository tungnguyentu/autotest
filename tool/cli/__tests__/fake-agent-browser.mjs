#!/usr/bin/env node
// agent-browser giả cho test: trả JSON cùng hình dạng bản thật, không mở trình duyệt.
// Biến môi trường: FAKE_AB_DIR (thư mục lưu url hiện tại và nhật ký lệnh), FAKE_AB_FAIL
// (danh sách lệnh phải lỗi, ngăn cách bằng dấu phẩy), FAKE_AB_TEXT (nội dung trả về của `get text`).
import fs from "node:fs";
import path from "node:path";

const dir = process.env.FAKE_AB_DIR;
const args = process.argv.slice(2);
if (args[0] === "--session") args.splice(0, 2);
if (args[0] === "--json") args.shift();
const [cmd, ...rest] = args;

const urlFile = path.join(dir, "url.txt");
const url = () => (fs.existsSync(urlFile) ? fs.readFileSync(urlFile, "utf8") : "about:blank");
fs.appendFileSync(path.join(dir, "calls.log"), JSON.stringify(args) + "\n");

const out = (data) => {
  console.log(JSON.stringify({ success: true, data, error: null }));
  process.exit(0);
};
const fail = (message) => {
  console.log(JSON.stringify({ success: false, data: null, error: message }));
  process.exit(1);
};

const refs = {
  e1: { role: "textbox", name: "Email" },
  e2: { role: "textbox", name: "Mật khẩu" },
  e3: { role: "button", name: "Đăng nhập" },
};
const attrs = {
  e1: { "aria-label": "Email", placeholder: "you@example.com", id: "email" },
  e2: { id: "password", name: "password" },
  e3: { id: "btn-4821593" },
};

const failing = (process.env.FAKE_AB_FAIL ?? "").split(",");
if (failing.includes(cmd)) fail(`${cmd} lỗi giả lập, tham số: ${rest.join(" ")}`);

switch (cmd) {
  case "open":
    fs.writeFileSync(urlFile, rest[0]);
    out({ url: rest[0], title: "Fake" });
    break;
  case "close":
    fs.rmSync(urlFile, { force: true });
    out({ closed: true });
    break;
  case "snapshot":
    out({ origin: url(), refs, snapshot: "- fake" });
    break;
  case "get": {
    const [what, target, attr] = rest;
    if (what === "url") out({ url: url() });
    if (what === "text") out({ text: process.env.FAKE_AB_TEXT ?? "Xin chào Lan" });
    if (what === "attr") {
      const ref = target.replace(/^@/, "");
      if (!refs[ref]) fail(`Unknown ref: ${ref}`);
      if (attr === "name" && ref === "e3") fail("không đọc được thuộc tính");
      out({ value: attrs[ref]?.[attr] ?? null });
    }
    fail(`get ${what} chưa hỗ trợ`);
    break;
  }
  case "click":
  case "fill":
  case "check":
  case "select":
  case "focus": {
    const t = rest[0];
    if (t?.startsWith("@") && !refs[t.slice(1)]) fail(`Unknown ref: ${t.slice(1)}`);
    if (cmd === "click" && t === "@e3") fs.writeFileSync(urlFile, new URL("/dashboard", url().startsWith("http") ? url() : "https://demo.example.com").toString());
    out({ done: cmd });
    break;
  }
  case "screenshot":
    fs.writeFileSync(rest[0], Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"));
    out({ path: rest[0] });
    break;
  case "press":
  case "wait":
  case "find":
    out({ done: cmd });
    break;
  default:
    fail(`Unknown command: ${cmd}`);
}
