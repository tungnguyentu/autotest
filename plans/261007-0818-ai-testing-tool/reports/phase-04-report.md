# Báo cáo Phase 4: Duyệt kết quả AI và Playwright

Trạng thái: xong. `npm run typecheck` sạch, `npm test` 100/100 pass, chạy xanh 3 lần liên tiếp (77 test cũ cộng 23 test mới).

## Việc đã làm

- `tool/api/ai-runs.ts` (mount ở `/api/runs`): `GET /:run/ai-runs` (JSON cộng `.md`, tiêu đề và status test case), `POST /:run/ai-runs/:id/decision` (`{decision, note, suspected_bug?}`), `GET /:run/files/*path`. Quyết định kiểm tra mọi thứ trước khi ghi. Sau đó ghi `tester` vào `ai-run/<id>.json` (qua `setTesterDecision` mới trong `ai-run-store.ts`). Tiếp theo đổi status trong `testcases.json`. Cuối cùng thêm mục vào `bugs.md`. Chỉ `reviewed`, `ai-passed`, `ai-failed` được quyết định. Xác nhận cần `ai_result`. Endpoint file chặn `..`, dotfile, symlink ra ngoài, chỉ `.png .md .json .txt .html`, kèm `Content-Security-Policy: sandbox`.
- `tool/core/bugs.ts`: `bugs.md` mỗi test case một mục, quyết định lại thì thay mục cũ, không trùng.
- `tool/core/playwright-runner.ts`: một tiến trình mỗi lúc (`RunnerBusyError`, API trả 409). Tiến trình con có nhóm riêng. Dừng bằng SIGTERM, rồi SIGKILL sau 5 giây. Log che giá trị `.env`, ghi vào `playwright-log.txt` và phát qua SSE. Cuối cùng ghi `playwright-last.json` (đúng schema `PlaywrightLastSchema` mới trong `schemas.ts`). Xóa `playwright-results.json` cũ trước mỗi lần chạy. `server.close()` dừng tiến trình con.
- `tool/api/playwright.ts`: `POST /api/features/:f/playwright/run`, `GET .../playwright?run=`, `POST .../stop`, và `/report/:run/` phục vụ `playwright-report/`.
- `POST /api/features/:f/testcases/:id/automate` trong `testcases.ts`: Trả 409 tiếng Việt trong các trường hợp sau: không phải `ai-passed`; chưa có spec; đợt chưa chạy; không có test của spec; spec chưa pass; spec sửa sau lần chạy. PATCH vẫn chỉ `draft ↔ reviewed`.
- `playwright.config.ts`: thêm reporter `list` và `json` (`<đợt>/playwright-results.json`), đổi trace thành `retain-on-failure`.
- UI: `ai-run-viewer.js`, `playwright-panel.js` (mới), `run.html`, `app.js` (thêm `App.listen`), `next-step.js`, `style.css`. `summary.ts` thêm cột "Quyết định tester" và "Playwright". `features.ts` overview thêm `cases` cho ô "Bước tiếp theo".
- Docs: `docs/README.md` (khu mới trên trang đợt, reporter), `docs/schemas.md` (`playwright-last.json`, `tester`, `bugs.md`).

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run typecheck` | Sạch |
| `npm test` x3 | 100/100, 100/100, 100/100 |
| Chạy thật qua API trên https://example.com | Xem dưới |
| Duyệt UI bằng Chromium headless (trang đợt) | Bảng step, ảnh, overlay, từ chối kèm nghi bug, log trực tiếp khi bấm "Chạy spec", iframe report, lệnh show-trace: đều chạy, 0 lỗi console |

Chạy thật (feature tạm `tmppw`, đã xóa cùng `tests/tmppw/`, `evidence/`):

```json
{"feature":"tmppw","spec":"tests/tmppw/TC_TMP_001.spec.ts","exit_code":0,"stopped":false,
 "started_at":"2026-10-07T16:24:07+07:00","finished_at":"2026-10-07T16:24:10+07:00",
 "tests":[{"file":"TC_TMP_001.spec.ts","title":"TC_TMP_001 - example.com có tiêu đề","status":"passed","duration_ms":765}]}
```

- `playwright-log.txt` có nội dung đầy đủ, `playwright-report/` có `index.html`, `data/`, `trace/`.
- Chạy spec thứ hai khi đang chạy: 409 "Playwright đang chạy...". Dừng spec dài (`waitForTimeout`): `exit_code: null`, `stopped: true`, không còn worker.
- Regression (không `spec`): 001 passed, 002 failed (cố ý), exit 1, có `trace.zip` của test fail. `automate` TC_TMP_001 sau khi pass: status thành `automated`.
- Lần đầu spec 001 fail thật vì example.com không còn heading "Example Domain" (trang đổi), đã đổi sang link "Learn more". Đây là lỗi spec mẫu, không phải lỗi tool.
- Cổng 4173 trống sau khi dừng server (`lsof` không in gì), không còn tiến trình mồ côi.

## Lệch so với kế hoạch

- Thêm `tool/ui/playwright-panel.js` (kế hoạch chỉ ghi `app.js` và `run.html`): giữ `run.html` gọn.
- `localIso` chuyển vào `paths.ts` và dùng chung (trước đó hai bản sao trong `login.ts`, `run-start.ts`).
- Watcher bỏ qua `playwright-log.txt`, `test-results/`, `playwright-report/` vì Playwright ghi hàng trăm file khi chạy. Kết thúc lần chạy có `playwright-last.json` báo cho UI.
- SSE thêm event `playwright` với `type: "playwright-log" | "playwright-state"`, tách khỏi event `change` để không làm hỏng các listener `watch` hiện có.
- Sửa lỗi Phase 2 trong `run.html`: `renderOverview` truyền `null` vào `replaceChildren`, làm hiện chữ "null" khi không có vấn đề.
- Trace đổi từ `on-first-retry` (không bao giờ tạo vì không có retry) sang `retain-on-failure`.

## Lưu ý cho Phase 5

- Thêm khu `ui-diff`: tạo file JS đăng ký `window.runSlots["ui-diff"] = (container, run, ctx) => ...` và thêm thẻ `<script>` trước script chính trong `run.html`, cạnh `ai-run-viewer.js`. Khi đổ nhiều phần tử vào `replaceChildren`, nhớ lọc `null` (nó không bỏ qua như `h()`). Chữ "Chưa hỗ trợ ở bản này." trong `section[data-slot="ui-diff"]` sẽ bị thay.
- `uiCheckRows()` trong `summary.ts` vẫn là chỗ thay cột số sai khác.
- `--update-snapshots`: `runner.start({feature, runDir, spec?, extraArgs: ["--update-snapshots"]})` trong `playwright-runner.ts`. API chưa mở tham số này, Phase 5 thêm trường vào body của `POST .../playwright/run` (và nên bắt buộc có xác nhận của tester). Runner dùng chung nên vẫn một tiến trình mỗi lúc. `snapshotPathTemplate` trỏ `tests/__screenshots__/<f>/`.
- `GET /api/features/:f/overview` có `cases[]` (status, `has_spec`, `ai_run`, `spec_result`), dùng được cho `next-step.js`.

## Chưa làm hoặc cần biết

- Không có test tự động cho JavaScript của UI, chỉ duyệt thủ công một lần bằng Chromium headless (script không giữ lại).
- `/to-playwright` chưa được thử với `ai-run` thật (vẫn chờ tester, như Phase 3). Spec dùng thử là spec viết tay.
- Không thử với staging thật (cần OTP).
- Phân giải tên đợt thành tính năng (`resolveRun`) mơ hồ nếu tồn tại cả tính năng `demo` và `demo_r2`. Hiếm, tính năng không có hậu tố vòng được ưu tiên.

Status: DONE
Summary: Phase 4 đã chạy thật trên example.com và qua UI headless. Gồm duyệt kết quả AI, chạy spec, regression, log, report, trace. Typecheck sạch, 100 test xanh 3 lần liên tiếp.
Concerns/Blockers: Không có chặn. Chưa thử `/to-playwright` với `ai-run` thật và chưa thử trên staging có OTP.
