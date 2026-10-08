# Sửa các phát hiện của code review

Ngày: 2026-10-07. Nguồn: `code-review.md` cùng thư mục. Kết quả: `npm run typecheck` sạch, `npm test` 170 test (141 cũ giữ nguyên, 29 mới), xanh 3 lần liên tiếp ở lượt chạy cuối (sau khi sửa một test chập chờn do chính tôi viết, xem "Ghi chú").

```
lần 1: tests 170, pass 170, fail 0
lần 2: tests 170, pass 170, fail 0
lần 3: tests 170, pass 170, fail 0
```

## Bảng phát hiện, cách sửa, bằng chứng

| Mã | Cách sửa | Bằng chứng |
| --- | --- | --- |
| C1 | `decisions.json` thêm `report_hash` (sha256 của `report.md`). `readScreenState` đặt `decisions_stale` khi hash khác hoặc thiếu (file cũ không có hash cũng bị coi là cũ). `undecidedCount` coi mọi mục là chưa quyết định khi stale, nên `uiDiffProgress.undecided` cũng đúng. `baselineBlockers` có lý do riêng "report.md đã đổi sau khi tester lưu quyết định, cần quyết định lại". Viewer hiện banner, không điền sẵn lựa chọn cũ. Sửa câu sai trong `ui-check/SKILL.md`. | `ui-diff.test.ts`: "report.md đổi sau khi lưu quyết định thì quyết định cũ hết hiệu lực và baseline bị chặn" (tái hiện đúng kịch bản review: quyết định v1, report v2 đổi dòng 1, trước sửa `blockers` là `[]`, sau sửa 409 và `undecided` = 3, quyết định lại thì mở khóa) và "decisions.json cũ không có mã băm bị coi là đã cũ" |
| M1 | `assertion.detail` đi qua `redactText` trước khi trả về và in. Che luôn cả `assert_url`. | `record-step.test.ts`: "assert_text che credential trong kết quả trả về", kiểm `JSON.stringify(result)` và cả giá trị cần tìm không còn mật khẩu |
| M2 | Lệnh mới `run-spec --feature --id [--run-dir]` (`tool/cli/run-spec.ts`) dùng `createPlaywrightRunner`, in log đã che, mã thoát 0 pass, 2 fail, dừng sạch khi bị ngắt. Sửa `to-playwright/SKILL.md`, `playwright-conversion.md`, `CLAUDE.md`, `docs/skills.md`, `docs/README.md` để dùng lệnh này và cấm `npx playwright test` trực tiếp. | `run-spec.test.ts` (3 test): log in ra có `<secret:USER_PASSWORD>`, không có giá trị; id sai, spec thiếu, `--run-dir` ngoài evidence, chưa có đợt đều bị từ chối. `npm run cli -- help` có lệnh mới. Chạy thật qua `node --import tsx tool/cli.ts run-spec ...` (fake Playwright, `.env` có `USER_PASSWORD`): `--id ok` thoát 0, stdout có `secret=<secret:USER_PASSWORD>`; `--id fail` thoát 2; `--id slow` rồi `kill -INT` sau 3 giây thì thoát 2 ("BỊ DỪNG"), `ps` không còn fake-playwright, stdout không có giá trị mật khẩu |
| M3 | Runner che `playwright-results.json` bằng `redact` với `.env` của feature ngay sau lần chạy (parse JSON, che, ghi nguyên tử; không phải JSON thì che theo văn bản). `playwright-log.txt` đã che từng dòng từ trước. `heal-locator` ghi rõ đọc bản đã che và không mở `playwright-report/`, `test-results/`. `docs/tester-guide.md` mục bảo mật ghi report HTML và trace có thể chứa giá trị đã nhập, không gửi đi. | `playwright-runner.test.ts`: "playwright-results.json được che credential..." (fake Playwright đặt giá trị vào `error.message`) |
| M4 | Giữ `detached` (cần để `process.kill(-pid)` tới được Chromium). Thêm `core/process-group.ts`: registry các nhóm tiến trình con, `installProcessCleanup` bắt SIGINT, SIGTERM, SIGHUP, `uncaughtException`, `unhandledRejection`, handler `exit` SIGTERM các nhóm còn lại; tín hiệu lần hai giết cứng (SIGKILL) thay vì bỏ qua như `process.once` cũ. Dùng ở `main()` của server và `run-spec`. `auth.ts` đăng ký tiến trình login vào registry. | Tái hiện thật bên dưới. `process-group.test.ts`: SIGHUP, SIGTERM, SIGINT đều dừng tiến trình con trong nhóm riêng |
| M5 | `checkLocatorOnly` bỏ các biểu thức locator (`getBy*`, `.locator`, `.frameLocator`, `.filter`, `.first/.last/.nth`, có quét ngoặc lồng và ngoặc trong chuỗi) thành một dấu giữ chỗ rồi so phần còn lại của dòng cũ và mới: tên hành động, giá trị nhập, tùy chọn phải giống hệt. Thêm `force:` và `test.slow` vào danh sách cấm. Chú thích `// TODO locator: ...` được bỏ khi so (skill yêu cầu nó). | `apply-diff.test.ts`: ba ca của review (`force: true`, `fill('a@b.vn')` thành `fill('khac@b.vn')`, `click` thành `.first().dblclick()`) đều bị từ chối; ca đổi locator hợp lệ có ngoặc lồng và TODO vẫn qua. 9 test cũ giữ nguyên |
| M6 | Trước `--update-snapshots`, `backupBaselines` chép `tests/__screenshots__/<f>/` sang `<đợt>/baseline-backup/<thời điểm>/`. `onFinish` khôi phục mọi ảnh trừ `<screen>.png` về bản sao (lần chạy lỗi: khôi phục tất cả). `baseline.json` thêm `backup` (đường dẫn tương đối, `null` nếu chưa có ảnh). Sửa fake Playwright ghi mọi `toHaveScreenshot` trong spec, như Playwright thật. | `ui-diff.test.ts`: spec ba `toHaveScreenshot`, `about.png` còn nguyên "about-cu", `extra.png` mới bị xóa, bản sao giữ `home.png` cũ, `baseline.json.backup` đúng; và ca `backup: null` |
| M7 | `assertFeatureName` và `FeatureSchema.feature` từ chối `/_r\d+$/i` (chỉ trường `feature` của `feature.json`; nhờ vậy `POST /api/features` trả 400). | `paths.test.ts`, `schemas.test.ts`, `server.test.ts` (`moi_r2` trả 400 và không tạo thư mục). `staging` vẫn hợp lệ |
| M8 | `writeJsonAtomic` đã ghi tạm rồi rename từ trước, nên phần "atomic" không cần đổi. Thêm khóa file `ai-run/<id>.json.lock` (cờ `wx`, chờ tối đa 3 giây, gỡ khóa quá 30 giây) quanh mọi đọc-sửa-ghi (`createAiRun`, `appendStep`, `setAiResult`, `setTesterDecision`). Khóa nằm trên đĩa vì race thật là giữa server và CLI (hai tiến trình). Viết lại comment cho đúng điều được đảm bảo. Watcher bỏ qua `.lock`. | `ai-run-store.test.ts`: khóa bị giữ thì báo lỗi rõ và không đụng file, khóa chết bị gỡ, không để lại file khóa, step làm trên số cũ bị từ chối |
| L1 | `readFeature` ở `POST /api/features/:f/runs` và `POST .../playwright/run` (404). | `server.test.ts`: "tạo đợt và chạy Playwright cho tính năng chưa có trả 404", không còn thư mục `evidence/*ghost*` |
| L2 | `resolveUserPath` (paths.ts) dùng thật `isSensitivePath` (đã mở rộng cho `.env.<tên>`), `realpath` chống symlink, chỉ nhận đường dẫn trong allowed roots. `run-finish --result-file`: chỉ trong project root hoặc thư mục đợt, từ chối `.env` và `auth/`, lỗi parse không còn echo đầu file. Skill `run-testcase` trước ghi kết quả vào `$TMPDIR` (ngoài project) nên đổi sang `<đợt>/ai-result-<id>.tmp`. | `record-step.test.ts`: "chỉ đọc file kết quả trong project hoặc thư mục đợt..." (`.env`, `auth/`, ngoài project, không phải JSON không lộ `SECRETWORD`); `paths.test.ts`: `resolveUserPath` kể cả symlink |
| L3 | `resolveEvidencePath` (tổng quát hóa `resolveRunDirOption`, kèm chặn nhạy cảm) áp cho `capture --out` và `compare --dir`. | `ai-run-store.test.ts`: `/etc`, `..`, `features/demo`, `auth`, `evidence/../features`, chính `evidence` đều bị từ chối |
| L4 | Origin phải cùng hostname local và cùng cổng với socket của server (`req.socket.localPort`), mặc định 80/443 khi Origin không ghi cổng. | `server.test.ts`: `localhost:9999` và `localhost` trả 403, `localhost:<cổng thật>` qua cổng kiểm tra (404 của route) |
| L5 | `.bak` đã có thì ghi `.bak.2`, `.bak.3` (cờ `COPYFILE_EXCL`). Phần "request treo" không sửa (xem bên dưới). | `heal.test.ts`: lần hai giữ `.bak` là spec gốc, `.bak.2` là spec sau lần áp đầu, `backup` trả về đúng |
| L6 | `publicUrl` (origin + pathname) áp cho `login.ts` (lưu, in, trả), `capture.ts` (`final_url`, cảnh báo chuyển hướng), `check-session.ts` (in), và `readSession` (meta cũ còn query cũng bị bỏ khi trả ra). | `paths.test.ts`: `publicUrl` |
| L7 | `parseSummary` tìm tiêu đề bằng regex neo đầu dòng. | `summary.test.ts`: tiêu đề test case chứa chuỗi "Kết luận của tester" không còn làm hỏng kết luận khi sinh lại hai lần |
| L9 | Watcher tính đường dẫn tương đối với gốc theo dõi trước khi loại `node_modules`, `test-results`, `playwright-report`. | `watcher-path.test.ts`: project nằm dưới `.../test-results/node_modules/proj` vẫn nhận sự kiện, `test-results` trong đợt vẫn bị bỏ |
| L10 | Glob trong ba skill: `????-??-??_<f>` và `????-??-??_<f>_r[0-9]*`, kèm `2>/dev/null`. | Đọc lại skill (không có test cho văn bản skill) |
| L11 | `CLAUDE.md` liệt kê `run-spec`, `capture`, `compare`, `start`. Hai nhánh 409 của ô "Bước tiếp theo": ai-run chưa có `ai_result` không còn gợi ý "xác nhận" (nhánh riêng "AI chưa ghi kết quả"); spec sửa sau lần chạy gần nhất thì `spec_result` là `null` nên gợi ý "Chạy spec" thay vì "đưa vào regression". `CaseProgress.ai_run` thêm `has_result`. | `overview-progress.test.ts` (kiểm API; logic JS của `next-step.js` đọc code, không có test chạy trình duyệt) |

## Tái hiện SIGHUP

Server chạy thật bằng `node --import tsx tool/server.ts` (cổng 4173, `PLAYWRIGHT_BIN` trỏ fake Playwright chạy mãi), một đợt và một lần chạy `slow.spec.ts`, rồi `kill -HUP <pid server>`. Script: `scratchpad/repro-sighup.sh <gốc>`; bản "trước" là bản sao của `tool/` chụp trước khi sửa.

Trước sửa:

```
--- trước SIGHUP (server pid 16502)
16502 16497 16474 node --import tsx tool/server.ts
16820 16502 16820 node .../before/tool/core/__tests__/fake-playwright.mjs test tests/demo/slow.spec.ts
--- sau SIGHUP
16820     1 16820 node .../before/tool/core/__tests__/fake-playwright.mjs test tests/demo/slow.spec.ts
```

Server chết, fake Playwright mồ côi (ppid 1) và vẫn chạy (tôi dọn tay sau đó).

Sau sửa:

```
--- trước SIGHUP (server pid 79100)
79100 79096 79073 node --import tsx tool/server.ts
79128 79100 79128 node .../after/tool/core/__tests__/fake-playwright.mjs test tests/demo/slow.spec.ts
--- sau SIGHUP
(không còn tiến trình nào)
--- cổng 4173
(trống)
```

Cuối phiên: `lsof -i :4173` trống; `features/` chỉ có `staging`, `tests/` chỉ có `staging`, `auth/` và `evidence/` rỗng.

## Quyết định cần ghi lại

- L7: review đề xuất "lấy lần cuối". Tôi lấy lần khớp đầu tiên ở đầu dòng, vì phần sau tiêu đề là văn bản tester tự gõ và có thể chứa lại dòng tiêu đề; phần sinh tự động phía trên không thể có dòng bắt đầu bằng `## Kết luận` (dòng bảng bắt đầu bằng `|`).
- M6: ảnh mới do `--update-snapshots` tạo cho screen khác (không có trong bản sao) bị xóa, vì baseline đó chưa được tester duyệt. Bản sao `baseline-backup/` được giữ vĩnh viễn trong đợt, đúng luật không xóa evidence.
- M4: `SIGKILL` hoặc mất điện vào chính server vẫn để lại tiến trình mồ côi (không bắt được). Review gợi ý pidfile dọn khi khởi động; không làm vì ngoài yêu cầu "bắt SIGHUP và exit".
- C1: `baseline.json` chưa bị vô hiệu khi chụp lại (review nêu `has_baseline` vẫn true cho ảnh mới). Yêu cầu chỉ nhắc `decisions.json`, nên tôi không đổi.
- M8: `withAiRunLock` chờ khóa bằng `Atomics.wait` (đồng bộ), nên khi có tranh chấp, server bị chặn event loop tối đa 3 giây. Chấp nhận cho tool local một tester; đổi sang bất đồng bộ cần đổi chữ ký của cả chuỗi hàm lưu.
- L2: `isSensitivePath` thêm `features/*/.env.<hậu tố>` (ví dụ `.env.local`), chặt hơn yêu cầu một chút; hằng `SENSITIVE_PATHS` vẫn giữ hai mục cũ (test cũ so sánh đúng hai mục đó) nên hằng và hàm lệch nhau ở đúng điểm này.
- Hợp đồng đổi: `Baseline` có thêm trường `backup` (bắt buộc ở bản đọc, mặc định `null` cho file cũ); `ScreenState` có `decisions_stale`; `CaseProgress.ai_run.has_result`; `writeDecisions` nhận thêm nội dung report.

## Chưa sửa

| Mục | Lý do |
| --- | --- |
| L5 phần request treo suốt lần chạy | Không nằm trong danh sách; cần đổi hợp đồng API (202 và SSE) |
| L12 (sleep cố định trong `server.test.ts`, test `isSensitivePath` chạy code chết) | Không nằm trong danh sách. Phần "không có test cho các lỗi trên" đã được bù bằng test mới; `isSensitivePath` nay có người gọi thật |
| L8 ảnh chụp lộ giá trị ô không phải mật khẩu | Chờ quyết định sản phẩm (đúng chỉ dẫn). Không đổi code hay docs |
| Chính sách che report HTML và trace | Chờ quyết định sản phẩm. Chỉ ghi cảnh báo vào `docs/tester-guide.md`; chưa chạy Playwright 1.63 thật với spec dùng `fill(process.env.X!)` để chốt mức lộ |
| Chặn baseline khi còn dòng `bug` | Chờ quyết định sản phẩm; `docs/README.md` vẫn ghi hành vi hiện tại |
| M6 với Playwright thật | Chỉ kiểm bằng fake Playwright (ghi mọi ảnh trong spec). Cần một lần chạy `--update-snapshots` thật với spec có hai `toHaveScreenshot` để xác nhận hành vi ghi đè |

## Ghi chú

- Test đầu tiên tôi viết cho watcher (`watcher-path.test.ts`) chập chờn 1 trong 7 lần chạy (mất sự kiện của file vừa tạo trên fsevents khi máy tải). Đã sửa bằng cách ghi lại file định kỳ cho tới khi thấy sự kiện; sau đó 7 lần `npm test` liên tiếp (4 lần ngay sau sửa, 3 lần ở lượt nghiệm thu cuối) đều xanh. Không có test cũ nào bị nới hay xóa; chỉ sửa fixture `fake-playwright.mjs` (ghi mọi ảnh, thêm `error.message` khi fail).
- Skill `run-testcase` đổi chỗ ghi file kết quả (vào thư mục đợt) vì rào mới ở `run-finish` từ chối đường dẫn ngoài project.

Status: DONE_WITH_CONCERNS
Summary: C1, M1 đến M8, hai mục Thấp đã xác nhận và các mục Thấp rõ ràng đã sửa kèm test; typecheck sạch, `npm test` 170/170 xanh, SIGHUP tái hiện trước (mồ côi) và sau (sạch). Ba mục chờ quyết định sản phẩm không đụng tới.
Concerns/Blockers: M3 (mức lộ của report/trace) và M6 (hành vi `--update-snapshots` thật) chưa kiểm với Playwright 1.63 thật; server bị SIGKILL vẫn có thể để lại tiến trình mồ côi.
