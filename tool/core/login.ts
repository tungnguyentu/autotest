import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { chromium } from "playwright";
import { readFeature } from "./feature-store.ts";
import { authDir, authFile, authFlagFile, authMetaFile, localIso, publicUrl, type PathOptions } from "./paths.ts";

export interface LoginOptions extends PathOptions {
  feature: string;
  /** Đường dẫn mở đầu, mặc định trang gốc của baseURL. */
  start?: string;
  /** Ngoài Enter trên stdin, chấp nhận file cờ auth/<feature>.save (Claude tạo khi tester báo đăng nhập xong trong chat). */
  waitFlag?: boolean;
  log?: (msg: string) => void;
}

export interface LoginResult {
  file: string;
  finalUrl: string;
}

const FLAG_POLL_MS = 500;

/** Chờ tín hiệu lưu. Trả về "closed" nếu tester đóng cửa sổ browser trước khi lưu. */
function waitForSignal(opts: { flagFile?: string; onClosed: (cb: () => void) => void }): {
  promise: Promise<"saved" | "closed">;
  stop: () => void;
} {
  let stop = () => {};
  const promise = new Promise<"saved" | "closed">((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    // Chỉ coi một dòng nhập là tín hiệu. stdin đóng (EOF) không được tự lưu phiên.
    rl.on("line", () => resolve("saved"));
    const timer = opts.flagFile
      ? setInterval(() => {
          if (fs.existsSync(opts.flagFile!)) resolve("saved");
        }, FLAG_POLL_MS)
      : undefined;
    opts.onClosed(() => resolve("closed"));
    stop = () => {
      rl.close();
      if (timer) clearInterval(timer);
    };
  });
  return { promise, stop };
}

/**
 * Mở Chromium có giao diện để tester đăng nhập tay (SSO, OTP, captcha), rồi lưu
 * storageState vào auth/<feature>.json và metadata vào auth/<feature>.meta.json.
 * Không in cookie hay token.
 */
export async function login(options: LoginOptions): Promise<LoginResult> {
  const log = options.log ?? ((m: string) => console.log(m));
  const feature = readFeature(options.feature, options);
  const out = authFile(options.feature, options);
  const meta = authMetaFile(options.feature, options);
  const flag = authFlagFile(options.feature, options);

  const start = options.start ?? "";
  if (start && !start.startsWith("/")) throw new Error(`--start phải bắt đầu bằng "/": ${start}`);
  const startUrl = feature.baseURL.replace(/\/+$/, "") + start;

  fs.mkdirSync(authDir(options), { recursive: true, mode: 0o700 });
  fs.rmSync(flag, { force: true }); // bỏ cờ cũ để không lưu nhầm ngay lập tức

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ viewport: feature.viewport });
    const page = await context.newPage();
    await page.goto(startUrl);

    log(`[login] Đăng nhập ${feature.service} trên cửa sổ browser vừa mở.`);
    log("[login] Hoàn tất SSO, OTP, captcha. Khi đã vào được hệ thống thì lưu phiên.");
    log(
      options.waitFlag
        ? `[login] Lưu phiên: bấm Enter tại terminal này, hoặc tạo file ${path.relative(process.cwd(), flag)} (Claude tạo khi bạn báo đã đăng nhập xong).`
        : `[login] Lưu phiên: bấm Enter tại terminal này (Ctrl+C để hủy).`,
    );

    const signal = waitForSignal({
      flagFile: options.waitFlag ? flag : undefined,
      onClosed: (cb) => browser.once("disconnected", cb),
    });
    const outcome = await signal.promise;
    signal.stop();
    if (outcome === "closed") throw new Error("Cửa sổ browser đã đóng trước khi lưu phiên. Chạy lại lệnh login.");

    await context.storageState({ path: out });
    fs.chmodSync(out, 0o600);
    // Trang sau đăng nhập có thể mang token trong query hoặc fragment: chỉ giữ origin và pathname.
    const finalUrl = publicUrl(page.url());
    fs.writeFileSync(
      meta,
      JSON.stringify(
        { feature: options.feature, saved_at: localIso(), final_url: finalUrl },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    fs.rmSync(flag, { force: true });
    log(`[login] Đã lưu phiên: ${out}`);
    log(`[login] URL cuối: ${finalUrl}`);
    return { file: out, finalUrl };
  } finally {
    await browser.close().catch(() => {});
  }
}
