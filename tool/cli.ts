import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createRunDir, assertFeatureName } from "./core/paths.ts";

class UsageError extends Error {}

const HELP = `Dùng: npm run cli -- <lệnh> [tùy chọn]

Lệnh:
  login --feature <f> [--start /path] [--wait-flag]
      Mở Chromium có giao diện để tester đăng nhập tay, rồi lưu auth/<f>.json.
      Bấm Enter để lưu. Với --wait-flag, tạo file auth/<f>.save cũng được (Claude tạo khi tester báo đã đăng nhập xong).
  check-session --feature <f> --url <url> [--headed | --headless]
      Nạp auth/<f>.json bằng Playwright, mở URL, báo có còn đăng nhập không.
  evidence-dir --feature <f>
      Tạo và in thư mục đợt test mới: <EVIDENCE_ROOT>/<YYYY-MM-DD>_<f>[_rN].
  run-start --feature <f> --id <TC> [--run-dir <đường dẫn>] [--force]
      Mở một ai-run: chọn hoặc tạo thư mục đợt, tạo ai-run/<id>.json rỗng, in tên session agent-browser.
      Từ chối test case chưa reviewed hoặc manual, trừ khi có --force.
  record-step --feature <f> --id <TC> --action <navigate|click|fill|press|select|check|assert_text|assert_url>
              [--ref e5 | --target-json '{"css":"#x"}'] [--value <v>] [--note <ghi chú>] [--run-dir <d>]
              [--wait-url <glob>] [--wait-text <chữ>] [--no-settle]
      Làm thao tác trong agent-browser rồi ghi step (role, name, URL trước và sau, ảnh) vào ai-run/<id>.json.
      Giá trị bắt đầu bằng dấu "-" viết dạng --value=-abc.
  fill-secret --feature <f> --id <TC> --ref e3 --key <TÊN_BIẾN> [--note <ghi chú>] [--run-dir <d>]
      Điền giá trị của TÊN_BIẾN trong features/<f>/.env vào element, ghi step với value "<secret:TÊN_BIẾN>".
      Không bao giờ in giá trị.
  run-finish --feature <f> --id <TC> --result-file <file.json> [--run-dir <d>]
      Ghi ai_result ({verdict, per_expected[]}) vào ai-run/<id>.json và đóng session agent-browser.
  validate-testcases --feature <f>
      Kiểm tra features/<f>/testcases.json theo schema, in thống kê và cảnh báo. Mã thoát 1 nếu sai schema.
  capture --feature <f> --out <đợt>/ui-diff [--screen <key> ...] [--full-page] [--headed | --headless]
      Chụp các screen trong feature.json (viewport của tính năng, phiên đăng nhập khi screen auth) vào
      <out>/<screen>/actual.png, sao ảnh Figma thành figma.png và ghi meta.json. Thiếu ảnh hoặc thiếu phiên chỉ là cảnh báo.
  compare --dir <đợt>/ui-diff/<screen> [--scale <n>] [--threshold 20] [--cell 16] [--cell-ratio 0.03] [--max-regions 15] [--pad 16]
      So figma.png với actual.png: ghi diff.png, side_by_side.png, crops/region_NN.png và metrics.json.
      Pixel diff chỉ khoanh vùng, không phải kết luận.
  feature-init --feature <f> --url <url> [--service <tên>] [--screen <key>] [--auth]
      Tạo features/<f>/feature.json từ URL (baseURL là origin, một screen theo đường dẫn). Không ghi đè.
  audit --feature <f> [--run-dir <đợt>] [--screen <key> ...] [--viewport 1440x900 ...] [--headed | --headless]
      Kiểm tra giao diện không cần Figma: mỗi screen, mỗi viewport (mặc định desktop và mobile 390x844),
      mỗi theme trong feature.json (sáng, tối). Ghi <đợt>/ui-audit/<screen>/shots/, review/ (ảnh sáng và tối
      cạnh nhau để xem) và checks.json (tương phản, tràn ngang, ảnh, tiêu đề, link, console, request lỗi,
      nút đổi theme). Không có --run-dir thì tạo đợt mới. Chỉ đo, không kết luận.
  usecase-add --feature <f> --file <đường dẫn .md hoặc .docx> [--name <tên file mới>]
      Thêm use case vào features/<f>/usecases/. File Word được chuyển sang .md, ảnh tách ra <tên>.images/,
      giữ file gốc. Không ghi đè file có sẵn.
  settings [--headless true|false]
      Xem hoặc đổi cài đặt trên máy này (settings.local.json, không commit).
      --headless false: mở cửa sổ trình duyệt cho Playwright (chụp, đo, chạy spec) và agent-browser
      (đồng bộ vào agent-browser.json). Session agent-browser đang mở giữ chế độ cũ đến khi đóng.
      Với Playwright, cờ --headed hoặc --headless của từng lệnh và biến HEADLESS=true|false ưu tiên hơn file này.
  run-spec --feature <f> --id <TC> [--run-dir <d>]
      Chạy tests/<f>/<TC>.spec.ts qua runner của tool, in log đã che credential và ghi kết quả vào <đợt>/playwright-last.json.
      Dùng lệnh này thay cho "npx playwright test". Mã thoát 2 khi spec fail.
  status [--feature <f>] [--json]
      Tiến độ từng tính năng: use case, test case theo trạng thái, phiên, đợt mới nhất, việc tiếp theo.

Các lệnh ghi QUYẾT ĐỊNH CỦA TESTER. Claude chỉ chạy khi tester nói rõ trong chat:
  testcase-status --feature <f> (--id <TC> ... | --all-draft) --status reviewed|draft
      Duyệt hoặc bỏ duyệt test case. Chỉ đổi giữa draft và reviewed.
  ai-decision --feature <f> --id <TC> --decision confirmed|rejected [--note <ghi chú>] [--bug <mô tả>] [--run-dir <d>]
      Xác nhận hoặc từ chối kết quả AI chạy thử. Status thành ai-passed hoặc ai-failed. --bug ghi vào <đợt>/bugs.md.
  automate --feature <f> --id <TC> [--run-dir <d>]
      Đưa vào regression (ai-passed thành automated). Spec phải pass ở lần chạy gần nhất, sau lần sửa cuối.
  heal-apply --feature <f> --id <TC> [--run-dir <d>]
      Áp <đợt>/heal/<TC>.diff (chỉ đổi dòng locator), sao lưu spec, chạy lại spec.
  ui-decision --feature <f> --screen <key> --item <số>=<bug|accept|review>[:ghi chú] ... [--run-dir <d>]
      Quyết định từng mục trong bảng sai khác của ui-diff/<screen>/report.md.
  baseline --feature <f> --screen <key> [--run-dir <d>]
      Tạo baseline toHaveScreenshot cho screen. Bị chặn khi còn mục chưa quyết định hoặc còn mục bug.

Chạy và tổng kết:
  ui-diff --feature <f> [--run-dir <d>] [--screen <key> ...] [--full-page] [--headed | --headless]
      Chụp các screen rồi so với ảnh Figma (capture và compare). Không có --run-dir thì tạo đợt mới.
  regression --feature <f> [--run-dir <d>]
      Chạy mọi spec trong tests/<f>/ qua runner của tool (log đã che credential).
  summary --feature <f> [--run-dir <d>] [--tester <tên>] [--environment <môi trường>] [--build <bản>] [--conclusion <kết luận>]
      Sinh lại <đợt>/summary.md. Kết luận chỉ ghi đúng lời tester nói.
  help
      In trợ giúp này.
`;

/** `--headed` hoặc `--headless` trên dòng lệnh. Không có cờ nào thì theo settings.local.json. */
function headedFlag(values: { headed?: boolean; headless?: boolean }): boolean | undefined {
  if (values.headed && values.headless) throw new UsageError("Chỉ dùng một trong --headed và --headless.");
  return values.headed ? true : values.headless ? false : undefined;
}

function requireFeature(value: string | undefined): string {
  if (!value) throw new UsageError("Thiếu --feature <tên tính năng>.");
  return assertFeatureName(value);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return command ? 0 : 1;
  }

  switch (command) {
    case "login": {
      const { values } = parseArgs({
        args: rest,
        options: {
          feature: { type: "string" },
          start: { type: "string" },
          "wait-flag": { type: "boolean", default: false },
        },
      });
      const { login } = await import("./core/login.ts");
      await login({ feature: requireFeature(values.feature), start: values.start, waitFlag: values["wait-flag"] });
      return 0;
    }
    case "check-session": {
      const { values } = parseArgs({
        args: rest,
        options: {
          feature: { type: "string" },
          url: { type: "string" },
          headed: { type: "boolean" },
          headless: { type: "boolean" },
        },
      });
      if (!values.url) throw new UsageError("Thiếu --url <url>.");
      const { checkSession } = await import("./cli/check-session.ts");
      const r = await checkSession({ feature: requireFeature(values.feature), url: values.url, headed: headedFlag(values) });
      console.log(`URL yêu cầu : ${r.requestedUrl}`);
      console.log(`URL cuối    : ${r.finalUrl}`);
      console.log(`Tiêu đề     : ${r.title}`);
      console.log(`Bị chuyển hướng: ${r.redirected ? "có" : "không"}`);
      console.log(`Có ô mật khẩu  : ${r.passwordFieldVisible ? "có" : "không"}`);
      console.log(r.ok ? "KẾT QUẢ: ĐẠT (phiên còn dùng được)" : "KẾT QUẢ: KHÔNG ĐẠT (có vẻ đã về trang đăng nhập)");
      return r.ok ? 0 : 2;
    }
    case "feature-init": {
      const { values } = parseArgs({
        args: rest,
        options: {
          feature: { type: "string" },
          url: { type: "string" },
          service: { type: "string" },
          screen: { type: "string" },
          auth: { type: "boolean", default: false },
        },
      });
      if (!values.url) throw new UsageError("Thiếu --url <địa chỉ trang>.");
      const { featureInit } = await import("./cli/feature-init.ts");
      const { file, feature } = featureInit({
        feature: requireFeature(values.feature),
        url: values.url,
        service: values.service,
        screen: values.screen,
        auth: values.auth,
      });
      console.log(`Đã tạo ${path.relative(process.cwd(), file)}`);
      console.log(JSON.stringify(feature, null, 2));
      return 0;
    }
    case "audit": {
      const { values } = parseArgs({
        args: rest,
        options: {
          feature: { type: "string" },
          "run-dir": { type: "string" },
          screen: { type: "string", multiple: true },
          viewport: { type: "string", multiple: true },
          headed: { type: "boolean" },
          headless: { type: "boolean" },
        },
      });
      const feature = requireFeature(values.feature);
      const { auditScreens, parseViewport } = await import("./cli/audit.ts");
      const { resolveEvidencePath } = await import("./core/ai-run-store.ts");
      let viewports;
      try {
        viewports = values.viewport?.map(parseViewport);
      } catch (err) {
        throw new UsageError((err as Error).message);
      }
      const runDir = values["run-dir"] ? resolveEvidencePath(values["run-dir"], "--run-dir") : createRunDir(feature);
      console.log(`Thư mục đợt: ${runDir}`);
      const results = await auditScreens({ feature, runDir, screens: values.screen, viewports, headed: headedFlag(values) });
      let broken = 0;
      for (const r of results) {
        console.log(`\n== ${r.screen}: ${r.url}`);
        for (const w of r.warnings) console.log(`  CẢNH BÁO: ${w}`);
        for (const v of r.variants) {
          const c = v.checks as any;
          if (!c) broken++;
          const parts = c
            ? [
                `hiển thị ${c.shown_theme}`,
                `tương phản thấp ${c.contrast.failures}`,
                `tràn ngang ${c.page.horizontal_scroll ? "CÓ" : "không"}`,
                `ảnh hỏng ${c.images.broken.length}`,
                `H1 ${c.headings.h1.length}`,
                `link không đích ${c.links.no_target.length}`,
                `rel sai ${c.links.bad_rel.length}`,
                `console ${v.console.length}`,
                `lỗi JS ${v.page_errors.length}`,
                `request lỗi ${v.failed_requests.length}`,
              ]
            : ["không đo được"];
          console.log(`  [${v.viewport} / ${v.theme}] ${parts.join(", ")}`);
          for (const w of v.warnings) console.log(`    CẢNH BÁO: ${w}`);
        }
        if (r.theme_toggle) {
          const t = r.theme_toggle;
          console.log(`  Nút đổi theme: ${t.error ? `lỗi: ${t.error}` : `đổi được ${t.switched ? "có" : "KHÔNG"}, nhớ sau tải lại ${t.remembered ? "có" : "KHÔNG"}`}`);
        }
        if (r.os_dark_preference) console.log(`  Hệ điều hành chọn tối, chưa chọn theme: trang hiển thị ${r.os_dark_preference.shown_theme}`);
        console.log(`  Kết quả: ${path.join(runDir, "ui-audit", r.screen, "checks.json")}`);
        console.log(`  Ảnh để xem: ${r.review_images.length} file trong ${path.join(runDir, "ui-audit", r.screen, "review")}`);
      }
      return broken ? 2 : 0;
    }
    case "usecase-add": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, file: { type: "string" }, name: { type: "string" } } });
      const feature = requireFeature(values.feature);
      if (!values.file) throw new UsageError("Thiếu --file <đường dẫn file use case>.");
      const src = path.resolve(values.file);
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new UsageError(`Không thấy file: ${src}`);
      const { readFeature } = await import("./core/feature-store.ts");
      const { addDocxUsecase, addMarkdownUsecase, usecasesDir } = await import("./core/usecase-store.ts");
      readFeature(feature);
      const name = values.name ?? path.basename(src);
      if (/\.docx$/i.test(name)) {
        const r = await addDocxUsecase(feature, name, fs.readFileSync(src));
        console.log(`Đã thêm ${path.join(usecasesDir(feature), r.converted)} (chuyển từ ${name}${r.images ? `, ${r.images} ảnh trong ${r.converted.slice(0, -3)}.images/` : ""})`);
        for (const w of r.warnings) console.log(`  CẢNH BÁO chuyển đổi: ${w}`);
      } else if (/\.md$/i.test(name)) {
        addMarkdownUsecase(feature, name, fs.readFileSync(src, "utf8"));
        console.log(`Đã thêm ${path.join(usecasesDir(feature), name)}`);
      } else {
        throw new UsageError(`"${name}" không phải .md hoặc .docx. File .doc cũ: mở bằng Word, lưu lại dạng .docx.`);
      }
      return 0;
    }
    case "settings": {
      const { values } = parseArgs({ args: rest, options: { headless: { type: "string" } } });
      const { readSettings, writeSettings, settingsPath, parseBool, resolveHeadless } = await import("./core/settings.ts");
      const settings = readSettings();
      if (values.headless !== undefined) {
        try {
          settings.playwright.headless = parseBool(values.headless, "--headless");
        } catch (err) {
          throw new UsageError((err as Error).message);
        }
        writeSettings(settings);
        console.log(`Đã lưu ${path.relative(process.cwd(), settingsPath())}`);
      }
      console.log(JSON.stringify(settings, null, 2));
      const effective = resolveHeadless(undefined);
      console.log(`Playwright: ${effective ? "chạy ẩn (headless)" : "mở cửa sổ (headed)"}${process.env.HEADLESS?.trim() ? " theo biến HEADLESS" : ""}`);
      console.log(`agent-browser: ${settings.playwright.headless ? "chạy ẩn" : "mở cửa sổ"} (session đang mở giữ chế độ cũ đến khi đóng)`);
      return 0;
    }
    case "evidence-dir": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" } } });
      console.log(createRunDir(requireFeature(values.feature)));
      return 0;
    }
    case "run-start": {
      const { values } = parseArgs({
        args: rest,
        options: { feature: { type: "string" }, id: { type: "string" }, "run-dir": { type: "string" }, force: { type: "boolean", default: false } },
      });
      if (!values.id) throw new UsageError("Thiếu --id <test case>.");
      const { runStart } = await import("./cli/run-start.ts");
      const r = await runStart({ feature: requireFeature(values.feature), id: values.id, runDir: values["run-dir"], force: values.force });
      for (const w of r.warnings) console.error(`[cảnh báo] ${w}`);
      console.log(`Thư mục đợt : ${r.runDir}`);
      console.log(`ai-run      : ${r.aiRunPath}`);
      console.log(`Session     : ${r.session}`);
      console.log(`baseURL     : ${r.baseURL}`);
      console.log(`Viewport    : ${r.viewport.width}x${r.viewport.height}`);
      console.log(`Phiên đăng nhập: ${r.authFile ?? "không có"}`);
      return 0;
    }
    case "record-step": {
      const { values } = parseArgs({
        args: rest,
        options: {
          feature: { type: "string" },
          id: { type: "string" },
          action: { type: "string" },
          ref: { type: "string" },
          "target-json": { type: "string" },
          value: { type: "string" },
          note: { type: "string" },
          "run-dir": { type: "string" },
          "wait-url": { type: "string" },
          "wait-text": { type: "string" },
          "no-settle": { type: "boolean", default: false },
        },
      });
      if (!values.id) throw new UsageError("Thiếu --id <test case>.");
      if (!values.action) throw new UsageError("Thiếu --action.");
      const { recordStep } = await import("./cli/record-step.ts");
      const r = await recordStep({
        feature: requireFeature(values.feature),
        id: values.id,
        action: values.action,
        ref: values.ref,
        targetJson: values["target-json"],
        value: values.value,
        note: values.note,
        runDir: values["run-dir"],
        waitUrl: values["wait-url"],
        waitText: values["wait-text"],
        noSettle: values["no-settle"],
      });
      console.log(JSON.stringify(r.step, null, 2));
      if (r.assertion) console.log(`Kiểm tra: ${r.assertion.passed ? "khớp" : "KHÔNG khớp"}. ${r.assertion.detail}`);
      return 0;
    }
    case "fill-secret": {
      const { values } = parseArgs({
        args: rest,
        options: {
          feature: { type: "string" },
          id: { type: "string" },
          ref: { type: "string" },
          key: { type: "string" },
          note: { type: "string" },
          "run-dir": { type: "string" },
        },
      });
      if (!values.id) throw new UsageError("Thiếu --id <test case>.");
      if (!values.key) throw new UsageError("Thiếu --key <TÊN_BIẾN>.");
      const { fillSecret } = await import("./cli/fill-secret.ts");
      const r = await fillSecret({
        feature: requireFeature(values.feature),
        id: values.id,
        ref: values.ref,
        key: values.key,
        note: values.note,
        runDir: values["run-dir"],
      });
      console.log(JSON.stringify(r.step, null, 2));
      return 0;
    }
    case "run-finish": {
      const { values } = parseArgs({
        args: rest,
        options: { feature: { type: "string" }, id: { type: "string" }, "result-file": { type: "string" }, "run-dir": { type: "string" } },
      });
      if (!values.id) throw new UsageError("Thiếu --id <test case>.");
      if (!values["result-file"]) throw new UsageError("Thiếu --result-file <file.json>.");
      const { runFinish } = await import("./cli/run-finish.ts");
      const r = await runFinish({ feature: requireFeature(values.feature), id: values.id, resultFile: values["result-file"], runDir: values["run-dir"] });
      for (const w of r.warnings) console.error(`[cảnh báo] ${w}`);
      console.log(`Đã ghi kết quả AI cho ${r.run.id} vào ${r.runDir}`);
      console.log(`Số step: ${r.run.steps.length}. Đề xuất: ${r.run.ai_result?.verdict}`);
      for (const e of r.run.ai_result?.per_expected ?? []) console.log(`  - [${e.verdict}] ${e.expected}`);
      console.log("Status test case không đổi. Tester xem kết quả rồi nói xác nhận hay từ chối (lệnh ai-decision).");
      return 0;
    }
    case "validate-testcases": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" } } });
      const { validateTestCases } = await import("./cli/validate-testcases.ts");
      const r = validateTestCases(requireFeature(values.feature));
      console.log(`Hợp lệ: ${r.total} test case.`);
      console.log(`Theo loại  : ${JSON.stringify(r.byType)}`);
      console.log(`Theo status: ${JSON.stringify(r.byStatus)}`);
      for (const w of r.warnings) console.log(`[cảnh báo] ${w}`);
      return 0;
    }
    case "capture": {
      const { values } = parseArgs({
        args: rest,
        options: {
          feature: { type: "string" },
          out: { type: "string" },
          screen: { type: "string", multiple: true },
          "full-page": { type: "boolean", default: false },
          headed: { type: "boolean" },
          headless: { type: "boolean" },
        },
      });
      if (!values.out) throw new UsageError("Thiếu --out <đợt>/ui-diff.");
      const { captureScreens } = await import("./cli/capture.ts");
      const { resolveEvidencePath } = await import("./core/ai-run-store.ts");
      const out = resolveEvidencePath(values.out, "--out");
      const results = await captureScreens({
        feature: requireFeature(values.feature),
        out,
        screens: values.screen,
        fullPage: values["full-page"],
        headed: headedFlag(values),
      });
      let failed = 0;
      for (const m of results) {
        const shot = fs.existsSync(path.join(out, m.screen, "actual.png"));
        if (!shot) failed++;
        console.log(`[${m.warnings.length ? "CẢNH BÁO" : "OK"}] ${m.screen}${shot ? "" : " (không có ảnh chụp)"}`);
        for (const w of m.warnings) console.log(`    - ${w}`);
      }
      return failed ? 2 : 0;
    }
    case "compare": {
      const { values } = parseArgs({
        args: rest,
        options: {
          dir: { type: "string" },
          scale: { type: "string" },
          threshold: { type: "string" },
          cell: { type: "string" },
          "cell-ratio": { type: "string" },
          "max-regions": { type: "string" },
          pad: { type: "string" },
        },
      });
      if (!values.dir) throw new UsageError("Thiếu --dir <đợt>/ui-diff/<screen>.");
      const num = (name: string, v: string | undefined): number | undefined => {
        if (v === undefined) return undefined;
        const n = Number(v);
        if (!Number.isFinite(n)) throw new UsageError(`--${name} phải là số, nhận được "${v}".`);
        return n;
      };
      const { compareDir } = await import("./cli/compare.ts");
      const { resolveEvidencePath } = await import("./core/ai-run-store.ts");
      const m = compareDir({
        dir: resolveEvidencePath(values.dir, "--dir"),
        scale: num("scale", values.scale),
        threshold: num("threshold", values.threshold),
        cell: num("cell", values.cell),
        cellRatio: num("cell-ratio", values["cell-ratio"]),
        maxRegions: num("max-regions", values["max-regions"]),
        pad: num("pad", values.pad),
      });
      console.log(JSON.stringify({ screen: m.screen, diff_ratio: m.diff_ratio, total_regions: m.total_regions, warnings: m.warnings }, null, 2));
      return 0;
    }
    case "run-spec": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, id: { type: "string" }, "run-dir": { type: "string" } } });
      if (!values.id) throw new UsageError("Thiếu --id <test case>.");
      const { runSpec } = await import("./cli/run-spec.ts");
      const { installProcessCleanup } = await import("./core/process-group.ts");
      let stop = async () => {};
      const uninstall = installProcessCleanup(() => stop());
      let r;
      try {
        r = await runSpec({
          feature: requireFeature(values.feature),
          id: values.id,
          runDir: values["run-dir"],
          onRunner: (runner) => {
            stop = async () => void (await runner.stop());
          },
        });
      } finally {
        uninstall();
      }
      console.log(`Thư mục đợt: ${r.runDir}`);
      console.log(`Spec       : ${r.spec}`);
      console.log(`Kết quả    : ${r.passed ? "PASS" : r.last?.stopped ? "BỊ DỪNG" : `FAIL (mã thoát ${r.last?.exit_code ?? "không rõ"})`}`);
      for (const t of r.last?.tests ?? []) console.log(`  - [${t.status}] ${t.title} (${t.duration_ms} ms)`);
      console.log(`Báo cáo    : ${r.runDir}/playwright-report/index.html (có thể chứa giá trị đã nhập, không gửi đi)`);
      return r.passed ? 0 : 2;
    }
    case "status": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, json: { type: "boolean", default: false } } });
      const { featureStatus } = await import("./core/status.ts");
      const { listFeatures } = await import("./core/feature-store.ts");
      const names = values.feature ? [requireFeature(values.feature)] : listFeatures();
      if (!names.length) console.log("Chưa có tính năng nào trong features/.");
      for (const name of names) {
        const st = featureStatus(name);
        if (values.json) {
          console.log(JSON.stringify(st, null, 2));
          continue;
        }
        const c = st.testcases.counts;
        console.log(`== ${name}: ${st.feature.service} (${st.feature.baseURL})`);
        console.log(`  Use case   : ${st.usecases.length ? st.usecases.map((u) => u.name).join(", ") : "chưa có"}`);
        console.log(`  Test case  : ${st.testcases.total} (draft ${c.draft}, reviewed ${c.reviewed}, ai-passed ${c["ai-passed"]}, ai-failed ${c["ai-failed"]}, automated ${c.automated})${st.testcases.error ? ` LỖI: ${st.testcases.error}` : ""}`);
        console.log(`  Đăng nhập  : ${st.session ? `phiên lưu lúc ${st.session.saved_at}` : "chưa có phiên"}`);
        console.log(`  Đợt mới nhất: ${st.latest_run ?? "chưa có"}`);
        for (const k of st.cases) {
          const ai = k.ai_run ? `AI ${k.ai_run.verdict ?? "chưa xong"}${k.ai_run.decision ? `, tester ${k.ai_run.decision}` : ""}` : "chưa chạy thử";
          console.log(`    ${k.id} [${k.status}] ${k.title} | ${ai} | spec ${k.has_spec ? (k.spec_result ?? "chưa chạy") : "chưa có"}`);
        }
        console.log(`  Việc tiếp theo: ${st.next_step}`);
      }
      return 0;
    }
    case "testcase-status": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, id: { type: "string", multiple: true }, "all-draft": { type: "boolean", default: false }, status: { type: "string" } } });
      const feature = requireFeature(values.feature);
      if (values.status !== "reviewed" && values.status !== "draft") throw new UsageError("--status phải là reviewed hoặc draft.");
      const { readTestCases } = await import("./core/feature-store.ts");
      const { setTestcaseStatus } = await import("./core/review.ts");
      const ids = values["all-draft"] ? readTestCases(feature).filter((t) => t.status === "draft").map((t) => t.id) : (values.id ?? []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
      if (!ids.length) throw new UsageError("Thiếu --id <mã> (lặp lại hoặc ngăn bằng dấu phẩy) hoặc --all-draft.");
      const changed = setTestcaseStatus(feature, ids, values.status);
      console.log(changed.length ? `Đã đổi sang ${values.status}: ${changed.map((t) => t.id).join(", ")}` : "Không có test case nào cần đổi.");
      return 0;
    }
    case "ai-decision": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, id: { type: "string" }, decision: { type: "string" }, note: { type: "string" }, bug: { type: "string" }, "run-dir": { type: "string" } } });
      const feature = requireFeature(values.feature);
      if (!values.id) throw new UsageError("Thiếu --id <test case>.");
      if (values.decision !== "confirmed" && values.decision !== "rejected") throw new UsageError("--decision phải là confirmed hoặc rejected.");
      const { findRunDirOfAiRun } = await import("./core/ai-run-store.ts");
      const { decideAiRun } = await import("./core/review.ts");
      const runDir = findRunDirOfAiRun(feature, values.id, values["run-dir"]);
      const r = decideAiRun(feature, runDir, values.id, { decision: values.decision, note: values.note, suspectedBug: values.bug });
      console.log(`${r.id}: tester ${r.decision}, status ${r.status} (đợt ${path.basename(runDir)})${r.bug_recorded ? `. Đã ghi bug vào ${path.join(runDir, "bugs.md")}` : ""}`);
      return 0;
    }
    case "automate": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, id: { type: "string" }, "run-dir": { type: "string" } } });
      const feature = requireFeature(values.feature);
      if (!values.id) throw new UsageError("Thiếu --id <test case>.");
      const { pickRunDir } = await import("./cli/run-spec.ts");
      const { automateTestcase } = await import("./core/review.ts");
      const t = automateTestcase(feature, pickRunDir(feature, values["run-dir"]), values.id);
      console.log(`${t.id}: đã đưa vào regression (status automated).`);
      return 0;
    }
    case "heal-apply":
    case "regression":
    case "baseline": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, id: { type: "string" }, screen: { type: "string" }, "run-dir": { type: "string" } } });
      const feature = requireFeature(values.feature);
      const { pickRunDir, runPlaywright, allPassed } = await import("./cli/run-spec.ts");
      const { installProcessCleanup } = await import("./core/process-group.ts");
      const runDir = pickRunDir(feature, values["run-dir"]);
      let stop = async () => {};
      const uninstall = installProcessCleanup(() => stop());
      const onRunner = (runner: { stop: () => Promise<unknown> }) => {
        stop = async () => void (await runner.stop());
      };
      const report = (last: import("./core/schemas.ts").PlaywrightLast | null) => {
        console.log(`Kết quả    : ${allPassed(last) ? "PASS" : last?.stopped ? "BỊ DỪNG" : `FAIL (mã thoát ${last?.exit_code ?? "không rõ"})`}`);
        for (const t of last?.tests ?? []) console.log(`  - [${t.status}] ${t.file}: ${t.title}`);
      };
      try {
        console.log(`Thư mục đợt: ${runDir}`);
        if (command === "heal-apply") {
          if (!values.id) throw new UsageError("Thiếu --id <test case>.");
          const { applyHeal } = await import("./core/heal-apply.ts");
          const r = await applyHeal({ feature, runDir, id: values.id, onRunner });
          console.log(`Đã áp đề xuất sửa locator vào tests/${feature}/${values.id}.spec.ts. Bản cũ: ${r.backup}`);
          report(r.last);
          return r.passed ? 0 : 2;
        }
        if (command === "regression") {
          const last = await runPlaywright({ feature, runDir, onRunner });
          report(last);
          return allPassed(last) ? 0 : 2;
        }
        if (!values.screen) throw new UsageError("Thiếu --screen <key>.");
        const { createBaseline } = await import("./core/ui-diff-gates.ts");
        const r = await createBaseline({ feature, runDir, screen: values.screen, onRunner });
        console.log(`Đã tạo baseline ${r.baseline.screenshot} từ ${r.baseline.spec}.${r.restored.length ? ` Giữ nguyên baseline của screen khác: ${r.restored.join(", ")}.` : ""}`);
        return 0;
      } finally {
        uninstall();
      }
    }
    case "ui-diff": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, "run-dir": { type: "string" }, screen: { type: "string", multiple: true }, "full-page": { type: "boolean", default: false }, headed: { type: "boolean" }, headless: { type: "boolean" } } });
      const feature = requireFeature(values.feature);
      const { resolveEvidencePath } = await import("./core/ai-run-store.ts");
      const { runUiDiff } = await import("./core/ui-diff-gates.ts");
      const runDir = values["run-dir"] ? resolveEvidencePath(values["run-dir"], "--run-dir") : createRunDir(feature);
      console.log(`Thư mục đợt: ${runDir}`);
      const results = await runUiDiff({ feature, runDir, screens: values.screen, fullPage: values["full-page"], headed: headedFlag(values) });
      for (const r of results) {
        console.log(`[${r.screen}] ${r.captured ? "đã chụp" : "KHÔNG chụp được"}${r.compared ? `, đã so: ${r.regions} vùng khác, diff_ratio ${((r.diff_ratio ?? 0) * 100).toFixed(2)}%` : ", chưa so"}`);
        for (const w of r.warnings) console.log(`    CẢNH BÁO: ${w}`);
      }
      return results.every((r) => r.captured) ? 0 : 2;
    }
    case "ui-decision": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, "run-dir": { type: "string" }, screen: { type: "string" }, item: { type: "string", multiple: true } } });
      const feature = requireFeature(values.feature);
      if (!values.screen) throw new UsageError("Thiếu --screen <key>.");
      const { pickRunDir } = await import("./cli/run-spec.ts");
      const { saveUiDecisions } = await import("./core/ui-diff-gates.ts");
      const { DECISION_VALUES } = await import("./core/schemas.ts");
      const items = (values.item ?? []).map((raw) => {
        const m = /^(\d+)=([a-z]+)(?::(.*))?$/s.exec(raw.trim());
        if (!m || !(DECISION_VALUES as readonly string[]).includes(m[2]!)) {
          throw new UsageError(`--item "${raw}" sai dạng. Dùng <số mục>=<${DECISION_VALUES.join("|")}>[:ghi chú], ví dụ 2=bug:lệch 8px.`);
        }
        return { index: Number(m[1]), decision: m[2] as (typeof DECISION_VALUES)[number], note: m[3] ?? "" };
      });
      if (!items.length) throw new UsageError("Thiếu --item <số mục>=<quyết định>.");
      const d = saveUiDecisions(pickRunDir(feature, values["run-dir"]), values.screen, items);
      console.log(`Đã lưu quyết định ${d.items.length} mục cho ${values.screen}: ${d.items.map((i) => `${i.index}=${i.decision}`).join(", ")}`);
      return 0;
    }
    case "summary": {
      const { values } = parseArgs({ args: rest, options: { feature: { type: "string" }, "run-dir": { type: "string" }, tester: { type: "string" }, environment: { type: "string" }, build: { type: "string" }, conclusion: { type: "string" } } });
      const feature = requireFeature(values.feature);
      const { pickRunDir } = await import("./cli/run-spec.ts");
      const { writeSummary } = await import("./core/summary.ts");
      const runDir = pickRunDir(feature, values["run-dir"]);
      writeSummary(feature, runDir, { tester: values.tester, environment: values.environment, build: values.build, conclusion: values.conclusion });
      console.log(`Đã ghi ${path.join(runDir, "summary.md")}`);
      return 0;
    }
    default:
      throw new UsageError(`Lệnh không tồn tại: ${command}`);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tool] Lỗi: ${msg}`);
    if (err instanceof UsageError) console.error("Chạy `npm run cli -- help` để xem cách dùng.");
    process.exit(1);
  },
);
