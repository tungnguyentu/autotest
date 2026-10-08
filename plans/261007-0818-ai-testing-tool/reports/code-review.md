# Code review: tool AI testing (toàn bộ cây nguồn)

Ngày: 2026-10-07. Người review: code-reviewer. Không có git nên review cả cây `tool/`, `.claude/skills/`, `playwright.config.ts`, `CLAUDE.md`, `docs/`. Không sửa code.

## Tóm tắt

Nền tảng chắc: chặn path traversal, Host/Origin, che credential trong file ghi ra và log Playwright, ranh giới "tester quyết định" ở phía API đều đúng và đã được thử thật (xem "Không phải vấn đề"). Typecheck sạch, `npm test` 141/141 pass.

Có 1 lỗi mức Cao chạm thẳng hợp đồng "tester kiểm soát": quyết định cũ của tester trên `decisions.json` vẫn được tính cho `report.md` mới, nên baseline có thể mở khóa mà tester chưa quyết định các dòng mới. Skill `ui-check` còn khẳng định ngược lại (tool tự vô hiệu quyết định cũ), điều này sai.

Về credential: file tool tự ghi (ai-run, log, SSE) đều che tốt, nhưng có ba đường lọt: (1) `assert_text` in nội dung trang chưa che ra stdout cho AI, đã tái hiện; (2) `/to-playwright` bảo AI chạy `npx playwright test` trực tiếp, bỏ qua bước che của runner; (3) report HTML, trace và `playwright-results.json` của Playwright không được che, trong khi spec nạp giá trị từ `process.env`. Mục (3) suy ra từ thiết kế, chưa chạy Playwright thật.

Hai phát hiện subagent báo ("POST runs" và "playwright/run" không kiểm tra tính năng) được xác nhận, mức Thấp.

Số phát hiện: Cao 1, Trung bình 8, Thấp 12.

Những gì chưa kiểm được: không có Playwright thật chạy với spec thật, không có agent-browser thật, không có staging. Mọi mục dựa vào hành vi Playwright thật được ghi rõ là suy luận.

## Bảng phát hiện

| # | Mức | Vị trí | Tóm tắt | Đã tái hiện |
|---|-----|--------|---------|-------------|
| C1 | Cao | `core/ui-diff-store.ts:211-229`, `cli/capture.ts:25`, `ui-check/SKILL.md:26` | Quyết định cũ áp lại cho report mới, mở khóa baseline | Có |
| M1 | Trung bình | `cli/record-step.ts:213-222,249`, `cli.ts:147` | `assert_text` in nội dung trang chưa che ra stdout của AI | Có |
| M2 | Trung bình | `to-playwright/SKILL.md:42`, `CLAUDE.md:57` | AI chạy `npx playwright test` trực tiếp, bỏ qua che credential của runner | Đọc code |
| M3 | Trung bình | `playwright.config.ts:28`, `heal-locator/SKILL.md:46`, `server.ts:118` | Report HTML, trace, `playwright-results.json` không che; AI được bảo đọc results.json | Suy luận |
| M4 | Trung bình | `core/playwright-runner.ts:133-139`, `server.ts:174-178`, `api/auth.ts:30-35` | Tiến trình con `detached` mồ côi khi server chết không qua SIGINT/SIGTERM | Có |
| M5 | Trung bình | `core/apply-diff.ts:118-152`, `heal-locator/SKILL.md:15,20` | Kiểm tra diff healing không chặn `force: true`, đổi dữ liệu nhập, đổi hành động | Có |
| M6 | Trung bình | `api/ui-diff.ts:196-201`, `core/ui-diff-store.ts:200-208` | Baseline chạy `--update-snapshots` cả spec, ghi đè baseline màn khác, không sao lưu bản cũ | Suy luận |
| M7 | Trung bình | `paths.ts:14`, `api/runs.ts:22,63-76` | Tên tính năng kết thúc `_rN` va chạm với tên đợt vòng N của tính năng khác | Có |
| M8 | Trung bình | `core/ai-run-store.ts:92-99`, `api/ai-runs.ts:87-88` | Đọc-sửa-ghi không khóa; comment hứa chống ghi đè nhưng chỉ đúng khi tuần tự | Đọc code |
| L1 | Thấp | `api/runs.ts:100-104`, `api/playwright.ts:52-74` | `POST runs` và `playwright/run` không kiểm tra tính năng tồn tại (xác nhận) | Có |
| L2 | Thấp | `cli/run-finish.ts:28-35`, `core/paths.ts:12,24-27` | `--result-file` đọc đường dẫn bất kỳ; lỗi JSON echo 10 ký tự đầu; `isSensitivePath` không được dùng ở đâu | Có |
| L3 | Thấp | `cli.ts:202-231`, `cli/capture.ts:29-33` | `capture --out`, `compare --dir` ghi/xóa ngoài evidence root | Đọc code |
| L4 | Thấp | `server.ts:59-72` | Origin chỉ so hostname, không so cổng | Có |
| L5 | Thấp | `api/heal.ts:63-66,78` | `.bak` lần 2 đè bản gốc; request treo suốt lần chạy | Đọc code |
| L6 | Thấp | `core/login.ts:90-94`, `api/auth.ts:17-25` | `final_url` đầy đủ (có thể có token query) lưu và trả qua API | Suy luận |
| L7 | Thấp | `core/summary.ts:182` | `indexOf` tiêu đề "Kết luận" không neo đầu dòng, hỏng kết luận khi tiêu đề test case chứa chuỗi đó | Có |
| L8 | Thấp | `core/redact.ts:9`, `core/playwright-runner.ts:141-145` | Không che giá trị < 3 ký tự, đa dòng, biến thể URL-encode; ảnh chụp lộ giá trị không phải ô mật khẩu | Suy luận |
| L9 | Thấp | `core/watcher.ts:18-23` | `isIgnored` khớp theo đường dẫn tuyệt đối: project nằm dưới thư mục tên `test-results` thì mất mọi sự kiện | Suy luận |
| L10 | Thấp | `ui-check/SKILL.md:17`, `to-playwright/SKILL.md:15`, `heal-locator/SKILL.md:39` | Glob `*_<feature>*` khớp cả tính năng khác (`staging` khớp `staging-eu`) | Đọc code |
| L11 | Thấp | `CLAUDE.md:10`, `docs`, `ui/next-step.js:49,75` | Danh sách lệnh thiếu `capture`/`compare`/`start`; hai nhánh "Bước tiếp theo" dẫn tới 409 | Đọc code |
| L12 | Thấp | `api/__tests__/server.test.ts:178-182,206`, `core/__tests__/paths.test.ts:98-109` | Test dùng sleep cố định, test chỉ phủ code chết, thiếu test cho các lỗi trên | Đọc code |

## Chi tiết

### C1 (Cao) Quyết định cũ vẫn áp cho report mới, mở khóa baseline

Vị trí: `tool/core/ui-diff-store.ts:211-214` (`undecidedCount`), `:217-229` (`baselineBlockers`), `:150-155` (chỉ so mtime report với metrics), `tool/cli/capture.ts:25` (`DERIVED` không có `decisions.json`, `baseline.json`), `.claude/skills/ui-check/SKILL.md:26`.

Kịch bản: tester lưu quyết định cho report v1 (dòng 1 = "Thấp, chấp nhận", đã `accept`). Sau đó tester bấm "Chụp và so" lại (đợt cùng ngày), chạy `/ui-check` ghi report v2, dòng 1 giờ là "Cao, Sai khác thật, nút Thanh toán thiếu". Skill dặn để nguyên `decisions.json`. `decisions.json` chỉ lưu `index` và `decision`, không gắn với nội dung report, nên `undecidedCount` thấy index 1 đã có quyết định.

Bằng chứng (chạy thật bằng hàm của store): sau quyết định v1 `baselineBlockers` trả `[]`; sau khi ghi report v2 khác dòng 1, vẫn trả `[]`. Nghĩa là nút "Cho tạo baseline" bật khi tester chưa quyết định một dòng nào của report mới. Viewer UI vẫn hiển thị bảng với lựa chọn cũ đã điền sẵn, không có cảnh báo. Câu trong skill "tool tự coi quyết định cũ là hết hiệu lực khi report mới hơn" không có mã nào hiện thực. Tương tự `baseline.json` không bị vô hiệu khi chụp lại: `has_baseline` (`api/features.ts:74`) vẫn true cho ảnh chụp mới, nên `next-step.js` coi screen đã xong.

Cách sửa: ghi vào `decisions.json` một mã băm của `report.md` (hoặc băm các dòng bảng) và `metrics.json.compared at`; `readScreenState` đặt `decisions.stale = true` khi băm khác; `baselineBlockers` và `undecidedCount` coi stale là chưa quyết định; viewer hiện banner. Cùng cách cho `baseline.json` (so với `meta.captured_at`). Không xóa file cũ (đúng luật không xóa evidence). Sửa câu trong `ui-check/SKILL.md` cho khớp. Thêm test: ghi decisions, ghi report mới khác nội dung, mong `baselineBlockers` khác rỗng.

### M1 (Trung bình) `assert_text` in nội dung trang chưa che

Vị trí: `record-step.ts:221` dựng `assertion.detail` từ `text.slice(0, 200)` và `execValue`; `:249` trả về nguyên; `cli.ts:147` in ra stdout. Phần ghi vào file thì được che (`:235-247`), phần trả về/in thì không.

Bằng chứng: với `.env` chứa `USER_PASSWORD=abc123xyz` và trang trả "Your password is abc123xyz", stdout in `...Nội dung đọc được: Profile page. Your password is abc123xyz ok`, còn `step.note` lưu `<secret:USER_PASSWORD>`. Stdout của lệnh chính là thứ AI đọc, nên đây là đường duy nhất AI thấy giá trị. Điều kiện kích hoạt: trang hiển thị giá trị bí mật (lỗi "mật khẩu abc123xyz sai", trang hồ sơ hiện email, v.v.).

Cách sửa: `assertion.detail = redactText(detail, secrets)` trước khi trả về; hoặc che toàn bộ `RecordStepResult`. Thêm test kiểm stdout/return, không chỉ file.

### M2 (Trung bình) AI chạy Playwright trực tiếp, bỏ qua che credential

Vị trí: `to-playwright/SKILL.md:42`, `CLAUDE.md:57`, `to-playwright/references/playwright-conversion.md:83`. Runner của tool che từng dòng log bằng `redactText` (`playwright-runner.ts:141-145`) nhưng skill bảo AI chạy `FEATURE=... npx playwright test` thẳng trong shell của AI, stdout đi nguyên vào ngữ cảnh. `playwright.config.ts:28` nạp `.env` vào tiến trình đó. Thông báo lỗi Playwright (`Expected: "hunter2"`, `toHaveValue`) có thể chứa giá trị. Điều này mâu thuẫn với `CLAUDE.md:18` ("Bạn chỉ thấy tên biến") và tiêu chí nghiệm thu 10.

Cách sửa: thêm lệnh `npm run cli -- playwright-run --feature F --run-dir D --spec S` dùng chính `createPlaywrightRunner` (đã che), in log đã che, và đổi skill + CLAUDE.md dùng lệnh đó.

### M3 (Trung bình) Artefact Playwright không được che; skill bảo AI đọc results.json

Vị trí: `playwright.config.ts:28,53-64`, `heal-locator/SKILL.md:46`, `server.ts:118` (`/report`), `playwright-runner.ts:184` (chỉ đọc status).

Chỉ `playwright-log.txt` được che. `playwright-report/` (HTML), `test-results/**/trace.zip` (`trace: retain-on-failure`), `playwright-results.json` đều do Playwright ghi, không qua `redactText`. Spec bắt buộc dùng `.fill(process.env.USER_PASSWORD!)` (`CLAUDE.md:56`, `playwright-conversion.md:68-69`); trace Playwright ghi tham số của `fill`, báo cáo lỗi in giá trị nhận được. Kết quả: giá trị nằm trong `evidence/` (thư mục tester có thể gửi đi), `/report/<đợt>/` phục vụ lên UI (vi phạm tiêu chí 10), và `heal-locator` dặn AI đọc `playwright-results.json` (`error.message`), vòng qua phần che log.

Chưa chạy Playwright thật nên mức độ lộ cụ thể (có trong trace/HTML hay không tùy thao tác) cần kiểm một lần với spec dùng `fill(process.env...)`.

Cách sửa: sau khi chạy, `onFinish` quét `playwright-results.json`, text trong `test-results/` và `playwright-report/data` để che hoặc xóa trace của spec có dùng `process.env`; tối thiểu sửa `heal-locator` chỉ đọc `playwright-log.txt` (đã che) và ghi rõ trong docs rằng trace/report có thể chứa giá trị. Quyết định này cần chủ sản phẩm chọn (che hay tắt trace cho spec có credential).

### M4 (Trung bình) Tiến trình con mồ côi khi server chết đột ngột

Vị trí: `playwright-runner.ts:133-139` (`detached: true`), `server.ts:174-178` chỉ xử lý SIGINT và SIGTERM, `process.once` nên Ctrl+C lần hai giết server không dọn; `api/auth.ts:30-35` (login) cùng kiểu.

Bằng chứng: khởi chạy server, bắt đầu một run chậm bằng fake Playwright, gửi SIGHUP cho server (đóng cửa sổ terminal). Server thoát ngay, fake Playwright vẫn chạy (đã tự dọn sau thử). SIGKILL, crash, đóng terminal đều cho kết quả tương tự. Mồ côi sẽ giữ Chromium và `playwright-log.txt` đang mở; lần chạy sau ghi đè log trong khi tiến trình cũ vẫn ghi vào. Đây đúng mô tả "ghost process" trong `process-management.md`.

Cách sửa: xử lý SIGHUP và `uncaughtException`/`unhandledRejection` gọi `close()`; ghi pidfile (`evidence/.runner.pid` hoặc thư mục tạm) khi spawn, khi khởi động kiểm pidfile cũ và dọn nhóm tiến trình còn sống; cân nhắc bỏ `detached` cho login.

### M5 (Trung bình) Kiểm tra diff healing yếu hơn skill khẳng định

Vị trí: `apply-diff.ts:118-152`; `heal-locator/SKILL.md:15` (cấm `force: true`, đổi URL, dữ liệu nhập) và `:20` ("Tool kiểm tra lại các điều cấm này ... trả 409").

Chạy thật `checkLocatorOnly` trả `[]` (cho áp) với:
- `.click()` -> `.click({ force: true })`;
- `.fill('a@b.vn')` -> `.fill('khac@b.vn')`;
- `.getByRole('button').click()` -> `.getByRole('button').first().dblclick()`.

Rule chỉ cần dòng đổi có token locator và không có `expect(`, `waitForTimeout`, `test.skip`. Dòng locator có thể đổi cả hành động và dữ liệu. Giảm nhẹ: tester xem diff trên UI trước khi bấm, và bảng `problems` hiển thị. Nhưng skill nói tool chặn, và tester không chuyên code dễ tin vào đó.

Cách sửa: so dòng cũ và dòng mới sau khi thay các biểu thức locator (`getBy*(...)`, `.locator(...)`, `.first/last/nth/filter(...)`) bằng placeholder; phần còn lại phải giống hệt. Thêm `force\s*:` và `test.slow` vào danh sách cấm. Nếu không làm, sửa skill thôi khẳng định tool chặn.

### M6 (Trung bình) Baseline có thể ghi đè baseline màn khác, không sao lưu

Vị trí: `ui-diff.ts:196-201` (`--update-snapshots` toàn spec), `ui-diff-store.ts:200-208` (`findScreenshotSpec` trả spec đầu tiên có `toHaveScreenshot('<screen>.png')`, không kiểm spec còn ảnh khác).

Nếu spec chứa nhiều `toHaveScreenshot`, lần "Cho tạo baseline" của màn A cập nhật cả ảnh của màn B (ít nhất những ảnh đang lệch hoặc thiếu), dù B chưa có quyết định nào. Ảnh baseline cũ bị ghi đè tại chỗ, không có bản sao, trong khi `CLAUDE.md` cấm ghi đè hoặc xóa evidence cũ. Chưa chạy Playwright thật (fake chỉ ghi một ảnh), nên cần xác nhận hành vi chính xác của `--update-snapshots` với bản 1.63.

Cách sửa: chỉ chạy test chứa màn đó (`--grep` theo tên test hoặc spec một ảnh một màn, từ chối nếu spec có hơn một tên ảnh); chép baseline cũ sang `<đợt>/ui-diff/<screen>/baseline-prev.png` trước khi chạy.

### M7 (Trung bình) Tính năng tên `foo_r2` va chạm với đợt vòng 2 của `foo`

Vị trí: `paths.ts:14` (regex tên tính năng cho phép `_r2`), `runs.ts:22` (`runPattern`), `runs.ts:63-76` (`resolveRun`), `ai-run-store.ts:21`.

Bằng chứng: tạo hai tính năng `foo` và `foo_r2` và thư mục `2026-10-07_foo_r2`: `listRuns("foo")` và `listRuns("foo_r2")` đều trả đợt đó, `resolveRun` gán nó cho `foo`. Hậu quả: danh sách đợt, summary và endpoint quyết định của đợt `foo_r2` có thể chạy dưới tính năng `foo`; `run-start` chọn nhầm "đợt mới nhất" của tính năng khác. Chỉ xảy ra khi đặt tên kiểu đó, nhưng khi xảy ra thì lẫn dữ liệu âm thầm. Comment ở `runs.ts:66-68` đã biết và chỉ giải quyết một phần.

Cách sửa: `assertFeatureName` từ chối tên khớp `/_r\d+$/i`. Một dòng, thêm test.

### M8 (Trung bình) Đọc-sửa-ghi không khóa trên ai-run

Vị trí: `ai-run-store.ts:93-99` (`appendStep`), `:101-111`; `api/ai-runs.ts:87-88`.

Comment nói số step phải đúng "để hai tiến trình ghi cùng lúc không đè nhau". Thực tế hai tiến trình cùng đọc `steps.length = 3`, cùng có `n = 4`, cùng qua kiểm tra, rồi ghi nguyên tử; bản ghi sau thắng, một step mất không báo lỗi. Tương tự `setTesterDecision` (server) đọc-ghi lại cả file trong khi `run-finish`/`record-step` của CLI có thể ghi cùng lúc, mất `ai_result` hoặc `tester`. Skill chạy tuần tự nên xác suất thấp, nhưng comment gây hiểu sai và `setTesterDecision` ghi cả `steps` cũ đè lên.

Cách sửa: ghi tạo file khóa (`ai-run/<id>.lock` bằng `open(..., 'wx')`) quanh đọc-ghi, hoặc ghi `n` bằng `rename` vào tên có số và kiểm tồn tại. Tối thiểu sửa comment cho đúng.

### L1 (Thấp) `POST runs` và `playwright/run` không kiểm tra tính năng (xác nhận)

Xác nhận bằng server thật (gốc tạm, cổng 4173, đã tắt):
- `POST /api/features/ghost/runs` trả 201 và tạo `evidence/2026-10-07_ghost`; gọi lại tạo `_r2`, không giới hạn. Tính năng `ghost` không có `feature.json`. `GET .../ghost/runs` liệt kê chúng, `GET .../ghost/overview` trả 404.
- `POST /api/features/ghost/playwright/run` trả 202 và spawn runner với `FEATURE=ghost`, ghi `playwright-last.json` vào đợt đó. Điều kiện: đợt `ghost` đã tồn tại (nhờ lỗi trên) và `tests/ghost/` có spec; nếu không có spec thì trả 409. Playwright thật sẽ thoát mã 1 vì `playwright.config.ts` gọi `readFeature` thất bại, nên không có tác hại ngoài rác và một run vô nghĩa.

Mức Thấp: chỉ lộ cho request cùng máy qua Host/Origin check (L4 làm yếu một phần), chỉ tạo thư mục rỗng. Gõ sai tên tính năng trong UI hoặc script sẽ rải thư mục `evidence/` mồ côi (phase 6 đã gặp một lần).

Cách sửa: gọi `readFeature(feature, ctx)` ở đầu `POST /` của `runsRouter` và `POST /run` của `playwrightRouter` (404 nếu chưa có), như các router khác (`usecases.ts:36`, `testcases.ts:28`) đã làm. Thêm test 404.

### L2 (Thấp) `--result-file` tùy ý; `isSensitivePath` là code chết

`run-finish.ts:30-34`: đọc đường dẫn bất kỳ và, khi không phải JSON, echo đầu file trong thông báo. Chạy thật với `--result-file features/f/.env` in `Unexpected token 'U', "USER_PASSW"... is not valid JSON` (10 ký tự). File là JSON hợp lệ nhưng sai dạng (ví dụ `auth/*.json`) thì thông báo Zod không echo giá trị, nên rò rỉ thực tế nhỏ (thường chỉ tên khóa) nhưng vẫn là kênh đọc file nhạy cảm. `SENSITIVE_PATHS` và `isSensitivePath` (`paths.ts:12,24-27`) được định nghĩa và kiểm thử nhưng không có chỗ nào trong code sản xuất gọi (đã grep toàn cây), nên rào chắn này chỉ tồn tại trên giấy.

Cách sửa: trong `runFinish` gọi `isSensitivePath` trên đường dẫn tương đối của `--result-file` và từ chối; thay thông báo lỗi parse bằng câu chung ("không phải JSON"). Dùng cùng rào cho `capture --out`, `compare --dir`.

### L3 (Thấp) `capture --out` và `compare --dir` không giới hạn trong evidence root

`cli.ts:217,253` dùng `path.resolve` thẳng. `capture.ts:29-33` `rmSync` `crops/` và các file dẫn xuất trong `<out>/<screen>/`. `resolveRunDirOption` (`ai-run-store.ts:40-49`) đã có sẵn cách chặn, các lệnh khác dùng nó. AI chạy sai `--out` có thể ghi/xóa ngoài evidence. Sửa: áp `resolveRunDirOption`.

### L4 (Thấp) Origin chỉ so hostname

`server.ts:62-69` chấp nhận `Origin: http://localhost:9999` cho POST (đã thử: 201). Mọi dịch vụ khác trên `localhost` (dev server, ứng dụng đang test chạy local, trang bị XSS) có thể gọi API ghi và spawn. Tác động hạn chế: spec phải có dạng `tests/<f>/<id>.spec.ts`, không có lệnh tùy ý. Sửa: so cả cổng với cổng server (`new URL(origin).port === String(port)`) hoặc kiểm `Sec-Fetch-Site: same-origin`; nên ghi chú thêm cho `Origin` thiếu từ client không phải trình duyệt.

### L5 (Thấp) Healing: `.bak` bị đè, request treo

`heal.ts:64-66` `copyFileSync` đè `.spec.ts.bak` mỗi lần áp, nên lần áp thứ hai mất bản gốc trước healing (docs nói "ngay trước lần áp này", nhưng người dùng có thể mong bản gốc). `heal.ts:78` `await done` giữ request HTTP tới hết lần chạy Playwright (có thể vài phút, không timeout); đóng tab không dừng lần chạy. Sửa: đánh số `.bak.1`, `.bak.2` (không ghi đè), trả 202 và để UI theo dõi bằng SSE như `playwright/run`.

### L6 (Thấp) `final_url` đầy đủ được lưu và trả qua API

`login.ts:90-94` lưu `page.url()` vào `auth/<f>.meta.json`; `auth.ts:17-25` trả qua `/api/features/:f/login` và `overview`; log login in `URL cuối`. Nếu trang sau đăng nhập có token trong query/hash (callback OAuth), nó lộ ra UI và `GET /api/features`. `capture.ts:97,99` đặt `final_url` và cảnh báo `Bị chuyển hướng tới ${page.url()}` vào `meta.json`. Chưa thấy trường hợp thật. Sửa: cắt `search` và `hash` trước khi lưu hoặc hiển thị.

### L7 (Thấp) Tách "Kết luận của tester" bằng `indexOf`

`summary.ts:182`. Chạy thật: một dòng bảng chứa `## Kết luận của tester` giữa dòng (ví dụ tiêu đề test case do AI sinh) làm `parseSummary` lấy cả phần từ giữa dòng đó, nên lần sinh lại sau ghi trùng và hỏng nội dung. Sửa: tìm tiêu đề neo đầu dòng (`/^## Kết luận của tester\s*$/m`, lấy lần cuối).

### L8 (Thấp) Giới hạn của việc che

`redact.ts:9` bỏ qua giá trị dưới 3 ký tự (có ghi chú), che từng dòng nên giá trị nhiều dòng (khóa PEM) không bị che trong log (`playwright-runner.ts:141`), không che biến thể URL-encode (`p%40ss`) trong `url_after`. Ảnh `screenshots/<id>/NN.png` chụp ô `fill-secret` nào không phải `type=password` (email, API key) hiển thị giá trị thật, lưu trong evidence, hiện trên UI và AI xem được qua công cụ đọc ảnh; trình duyệt chỉ che ô mật khẩu. Đây là hạn chế thiết kế mà tiêu chí 10 ("không giá trị credential trong UI") không thực hiện được tuyệt đối. Cần chủ sản phẩm quyết định chấp nhận và ghi vào docs (khuyên: chỉ dùng `fill-secret` cho ô mật khẩu/token ẩn).

### L9 (Thấp) `isIgnored` dùng đường dẫn tuyệt đối

`watcher.ts:22` kiểm từng đoạn của đường dẫn tuyệt đối. Nếu project hoặc `EVIDENCE_ROOT` nằm dưới thư mục tên `node_modules`, `test-results` hoặc `playwright-report`, mọi sự kiện bị bỏ và UI không tự cập nhật. Sửa: tính đường dẫn tương đối với gốc theo dõi trước khi kiểm.

### L10 (Thấp) Glob `*_<feature>*` quá rộng

`ui-check/SKILL.md:17`, `to-playwright/SKILL.md:15`, `heal-locator/SKILL.md:39`. Với `staging`, glob khớp `2026-10-07_staging-eu`. `heal-locator` dùng `*_F*/playwright-last.json` nên có thể chọn nhầm đợt của tính năng khác khi tên có tiền tố chung. Sửa: `*_<feature>/` và `*_<feature>_r*/` (hai mẫu), hoặc thêm lệnh CLI trả đợt mới nhất đúng như `listRunDirs`.

### L11 (Thấp) Lệch nhỏ giữa tài liệu, skill và UI

- `CLAUDE.md:10` liệt kê lệnh hiện có nhưng thiếu `capture`, `compare`, `start`, trong khi `ui-check/SKILL.md:13` dẫn `capture` rồi `compare` và `CLAUDE.md:9` bắt mọi script đi qua `npm run cli`.
- `ui/next-step.js:49` nhắc "xem và xác nhận kết quả AI" ngay khi có ai-run chưa có `ai_result`, nhưng `api/ai-runs.ts:73` trả 409 khi xác nhận.
- `ui/next-step.js:75` báo "spec đã pass, đưa vào regression" không xét spec sửa sau lần chạy, trong khi `automate` trả 409 (`testcases.ts:94`).
- Tên lệnh trong `next-step.js` (`/gen-testcases`, `/run-testcase`, `/to-playwright`, `/heal-locator`, `/ui-check`) và thứ tự tham số khớp với năm `SKILL.md`: không lệch.

### L12 (Thấp) Chất lượng test

- `server.test.ts:178-182`: `sleep(200)` trước khi ghi file (thừa vì helper đã `await watcherReady`, `helpers.ts:65`), rồi `sleep(400)` cố định, sau đó khẳng định `.env` không xuất hiện. Kiểm tra âm sau một cửa sổ thời gian cố định có thể qua rỗng khi máy chậm. Nên chờ một sự kiện đã biết xuất hiện (`testcases.json`, đã làm) và coi đó là mốc kết thúc, bỏ sleep 400. Dòng 180 còn `[CASE, CASE].slice(0, 1)` là tàn dư. Dòng 206 `sleep(200)` tương tự.
- `paths.test.ts:98-109` kiểm `SENSITIVE_PATHS` và `isSensitivePath`, hai thứ không có người gọi (L2): test chạy code chết, không chứng minh hành vi nào.
- Chưa có test cho: quyết định cũ sau report mới (C1), `assertion.detail` đã che (M1), `force: true` trong diff (M5), tên tính năng `_rN` (M7), `POST runs` với tính năng không tồn tại (L1), runner mồ côi (M4). Cả sáu lỗi đều qua 141 test.
- `waitFor` trong `playwright-runner.test.ts`, `ui-diff.test.ts`, `ai-runs.test.ts` đợi theo điều kiện với hạn 5 giây, không phải sleep mù: chấp nhận được.

## Không phải vấn đề (đã kiểm, thấy ổn)

Bảo mật và rò rỉ:
- Endpoint file của đợt (`api/ai-runs.ts:96-117`): đã thử `%2e%2e`, `..%2f`, `x%2F..%2F..%2Fsecret.json`, symlink trỏ ra ngoài. Tất cả 400. `realpath` là chốt cuối, đúng; đuôi file giới hạn, kèm `Content-Security-Policy: sandbox`.
- Static report `/report/<đợt>/` và UI tĩnh: `../`, `%2e%2e`, `/.env`, `/features/...`, `/auth/...` đều 404. UI tĩnh chỉ phục vụ `tool/ui`.
- Host check: `evil.com` và `localhost.evil.com` 403, `127.0.0.1` cho qua; Origin `evil.com`, `null`, `localhost.evil.com` 403 cho POST; `/events` không có header CORS. DNS rebinding bị chặn.
- `redact.ts`: một lượt, giá trị dài trước, escape regex, đệ quy; `fill-secret.ts` không in giá trị, lỗi chỉ liệt kê tên khóa; `agent-browser.ts` tự dựng thông báo lỗi không dùng `err.message` của Node (chứa dòng lệnh) và che bằng `redactText`; `execFile` không qua shell; step ghi file đã che sau `parse`. Test `record-step.test.ts` quét mọi file trong đợt.
- SSE chỉ phát `{path, type}`, bỏ `.env` (đã có test); `auth/*.json` không đọc, chỉ đọc `.meta.json`. UI không dùng `innerHTML` (đã grep): mọi nội dung API vào DOM bằng `textContent`.
- Giá trị bí mật xuất hiện trong `argv` của `agent-browser fill` (thấy qua `ps` với người dùng khác trên cùng máy). Chấp nhận với máy cá nhân của tester, nên ghi chú nếu dùng máy dùng chung.

Hợp đồng "tester kiểm soát":
- Không đường nào trong tool hoặc skill tự đổi status sang `automated`: chỉ `POST .../testcases/:id/automate` do nút của tester gọi, có cổng (đang `ai-passed`, spec tồn tại, pass ở lần chạy gần nhất, spec không sửa sau lần chạy). PUT/PATCH chỉ cho `draft` và `reviewed` (đã đọc `testcases.ts`); `decision` chỉ chuyển `reviewed|ai-*` sang `ai-passed|ai-failed` và yêu cầu `ai_result` khi xác nhận; `run-finish` không đụng status hay `tester` (kiểm `ai-run-store.ts`, `run-finish.ts`).
- Baseline, áp diff healing, đưa vào regression, xác nhận AI đều chỉ qua `api("POST")` gắn với nút (đã grep `ui/*.js`, không có gọi tự động). Skill đều có mục "Không được làm" khớp `CLAUDE.md`. Không có Figma MCP, không CI, không git trong mã. (C1 và M5 là lỗ hổng ở phía thực thi của các quy tắc này, không phải thiếu quy tắc.)
- Việc baseline vẫn tạo được khi tester đánh dấu một dòng là `bug` đã được ghi nhận trong `docs/README.md:147`, là quyết định thiết kế đã công bố; phase 5 tự nêu có thể siết. Không tính là lỗi.

Lỗi logic:
- `paths.ts`: `createRunDir` dùng `mkdir` không đệ quy lớp cuối, vòng `EEXIST`, hai tiến trình không nhận cùng thư mục; `createAiRun` từ chối ghi đè; upload use case dùng cờ `wx`. `localDate`/`localIso` đúng cho `+07:00` và độ lệch âm.
- `playwright-runner.ts`: một runner mỗi lúc (409 khi bận), nhóm tiến trình SIGTERM rồi SIGKILL sau `killGraceMs`, ghi `playwright-last.json` sau `close` (đủ stdout/stderr), xóa `playwright-results.json` cũ trước khi chạy, `onFinish` bọc try/catch, `stop()` chờ `done`. Tham số spec bị ràng chặt `tests/<f>/<id>.spec.ts`, `--update-snapshots` là hằng số phía server.
- `apply-diff.ts`: phần dòng thừa sau hunk đủ bị bỏ qua nhất quán cho cả kiểm tra lẫn áp dụng (không có dòng "lọt qua kiểm tra nhưng được áp"); đếm dòng hunk; khớp vị trí duy nhất; không trả kết quả một phần; chặn `expect`, `waitForTimeout`, `test.skip/fixme/fail` cả dòng `+` lẫn `-`. Chỉ yếu ở phần M5.
- `compare.ts`: đặt nền trắng cho alpha, `downscale` bằng trung bình, cảnh báo lệch kích thước, gộp vùng liên thông 8 hướng, mask qua `ignoreMask`, kiểm tra mọi tham số số học. Vùng nhỏ dưới `cellRatio` bị bỏ khỏi `regions` nhưng vẫn tính vào `diff_ratio`: đúng thiết kế (ghi trong `NOTE`).
- `watcher.ts`: debounce, tạo sẵn thư mục gốc, nhãn đường dẫn đúng cho `EVIDENCE_ROOT` ngoài project; không đọc nội dung.
- `ai-run-store.ts`: `resolveRunDirOption` chặn ra ngoài evidence root; xóa đợt hay evidence cũ không có đường nào.

Kiểm chứng đã chạy: `npm test` 141 pass, `npm run typecheck` sạch. Các thử nghiệm tay dùng thư mục gốc tạm trong scratchpad, cổng 4173, đã tắt server và dọn tiến trình; `features/`, `auth/`, `evidence/`, `tests/` của project không bị thay đổi.

## Hành động đề xuất (theo thứ tự)

1. C1: gắn quyết định và baseline với băm report/lần chụp; sửa câu sai trong `ui-check/SKILL.md`; thêm test.
2. M1 và M2: che `assertion.detail`; thêm lệnh CLI chạy Playwright qua runner có che; đổi `to-playwright` và `CLAUDE.md`.
3. M3: chốt chính sách trace/report khi spec dùng credential; sửa `heal-locator` chỉ đọc log đã che.
4. M4: xử lý SIGHUP và pidfile dọn mồ côi.
5. M5, M6: siết kiểm tra diff theo "phần còn lại của dòng giống hệt"; baseline chạy đúng một test và sao lưu ảnh cũ.
6. M7, L1: một dòng mỗi cái (`assertFeatureName` từ chối `_rN`, `readFeature` ở hai POST).
7. Phần còn lại theo bảng.

## Câu hỏi chưa giải quyết

- M3 và M6 cần một lần chạy Playwright 1.63 thật với spec có `fill(process.env.X!)` và spec có hai `toHaveScreenshot` để chốt mức độ. Ai có tài khoản staging chạy được?
- L8: chủ sản phẩm có chấp nhận ảnh chụp lộ giá trị ô không phải mật khẩu, hay giới hạn `fill-secret` cho ô ẩn?
- Baseline khi có dòng `bug`: giữ như tài liệu (cho tạo) hay siết (phase 5 đã hỏi)?
