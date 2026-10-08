# Quy tắc test

## Vai trò
- Tester kiểm soát đầu ra. Mọi kết quả của bạn là ĐỀ XUẤT cho tester duyệt
- KHÔNG tự kết luận PASS/FAIL cuối, KHÔNG tự cập nhật baseline,
  KHÔNG tự đổi status sang automated

## Tester chỉ chat
- Tester không gõ lệnh, không mở UI (UI đang tạm dừng). Bạn chạy mọi lệnh thay tester và trả lời bằng tiếng Việt, ngắn
- Chưa có `node_modules/`: chạy `npm install` và `npx playwright install chromium` trước khi làm việc khác
- Tester nói "mở trình duyệt", "cho xem trình duyệt", "chạy có giao diện": `npm run cli -- settings --headless false`.
  Nói "chạy ẩn", "tắt trình duyệt": `--headless true`. Áp dụng cho Playwright và agent-browser. Session agent-browser
  đang mở giữ chế độ cũ: đóng session rồi mở lại. Không tự đổi khi tester không yêu cầu
- Tester gửi file use case (.md, .docx của D5) hoặc đường dẫn file: `npm run cli -- usecase-add --feature <f> --file <đường dẫn>`
- Đăng nhập qua chat (trang cần SSO, OTP, captcha):
  1. Chạy nền `npm run cli -- login --feature <f> --wait-flag`. Lệnh mở cửa sổ trình duyệt trên máy tester
  2. Nhắn tester: đăng nhập trên cửa sổ vừa mở, xong thì trả lời "xong". Không hỏi, không nhận mật khẩu hay OTP qua chat
  3. Tester trả lời xong: tạo file rỗng `auth/<f>.save` (`touch`). Lệnh login tự lưu phiên, xóa file cờ rồi thoát
  4. Kiểm tra: `npm run cli -- check-session --feature <f> --url <baseURL + path>`
- Tester gửi mật khẩu hay OTP vào chat: không dùng, không lặp lại, nhắc tester đổi mật khẩu và đăng nhập trên cửa sổ trình duyệt
- Skill nhắc thao tác "trên UI" mà chưa có lệnh tương ứng: nói rõ cho tester bước đó cần làm gì, không tự quyết thay tester

## Lệnh của tool
- Mọi script gọi qua `npm run cli -- <lệnh>`. Không chạy file trong `tool/` trực tiếp, không tự viết script xử lý ảnh hay phiên
- Lệnh hiện có: `login`, `check-session`, `evidence-dir`, `feature-init`, `audit`, `settings`, `usecase-add`, `validate-testcases`, `run-start`, `record-step`, `fill-secret`, `run-finish`, `run-spec`, `capture`, `compare`, `start`. Xem `npm run cli -- help`
- Chạy spec Playwright chỉ bằng `npm run cli -- run-spec`. KHÔNG chạy `npx playwright test` trong shell của bạn: log và `playwright-results.json` chỉ được che credential khi đi qua lệnh này
- Schema mọi file dùng chung: `docs/schemas.md`

## Tính năng, môi trường, đăng nhập
- Luôn xác định <feature> trước khi làm; cấu hình ở features/<feature>/feature.json
- Đăng nhập SSO/OTP/captcha do TESTER làm tay trên cửa sổ trình duyệt do lệnh `login` mở -> auth/<feature>.json
- KHÔNG tự vượt SSO/OTP/captcha. Thiếu hoặc hết phiên -> làm quy trình đăng nhập qua chat ở mục "Tester chỉ chat"
- Credential trong features/<feature>/.env (nếu có): KHÔNG in, KHÔNG đọc nội dung file, KHÔNG ghi vào report, log, spec
- Điền credential chỉ qua lệnh `npm run cli -- fill-secret`. Bạn chỉ thấy tên biến, ví dụ `<secret:USER_EMAIL>`, không bao giờ thấy giá trị
- Không đọc, không sao chép, không in `auth/` và `features/*/.env`. Ngoại lệ duy nhất: tạo file cờ rỗng `auth/<f>.save` khi đăng nhập qua chat
- Không dùng phiên/credential của tính năng này cho tính năng khác

## Evidence
- Lưu trên disk: $EVIDENCE_ROOT/<YYYY-MM-DD>_<feature>/ (mặc định ./evidence; chạy lại cùng ngày: _r2, _r3)
- Tạo thư mục đợt bằng `npm run cli -- evidence-dir --feature <feature>`
- KHÔNG ghi đè hoặc xóa evidence cũ
- Cuối đợt cập nhật summary.md, để trống mục "Kết luận của tester"

## Test case
- Lưu ở features/<feature>/testcases.json theo schema: id, title, screen,
  preconditions, steps, expected, priority, type, status
- Dùng skill `gen-testcases` (`/gen-testcases <feature>`): chỉ thêm id mới, không ghi đè test case có sẵn, `status: draft`
- Phủ positive, negative, boundary, validation; test data cụ thể
- Bước cần OTP/captcha -> đánh dấu "manual": true
- Chỉ chạy test case có status = reviewed

## AI chạy thử
- Dùng skill `run-testcase` (`/run-testcase <feature> <id>`). Công cụ chạy thử là agent-browser (CLI). Không dùng browser-use, không dùng Playwright MCP
- Quy trình: `run-start` -> mở agent-browser với `--state auth/<feature>.json`, đặt viewport theo feature.json
  -> mỗi bước test case làm bằng `record-step` (hoặc `fill-secret` cho credential) -> kiểm tra expected bằng
  `record-step --action assert_url|assert_text` -> `run-finish --result-file`
- Không tự chạy `agent-browser click/fill/open` cho bước của test case: thao tác không qua `record-step` không vào history
- `record-step` tự lưu `<đợt>/ai-run/<id>.json` kèm thuộc tính element (role, name, label, placeholder, css), theo schema
  trong docs/schemas.md. Ảnh từng step: `<đợt>/screenshots/<id>/<số step>.png`
- Kết quả đề xuất: `<đợt>/ai-run/<id>.md`, viết theo `.claude/skills/_shared/report-template.md`
- Gặp đăng nhập, OTP, captcha: dừng, `run-finish` với KHÔNG XÁC ĐỊNH và lý do "CẦN TESTER ĐĂNG NHẬP LẠI"

## Chuyển sang Playwright
- Dùng skill `to-playwright` (`/to-playwright <feature> <id>`). Chỉ chuyển test case tester đã xác nhận
  (`tester.decision = "confirmed"` trong ai-run/<id>.json); đầu vào là ai-run/<id>.json
- File: tests/<feature>/<id>.spec.ts, tên test bắt đầu bằng ID
- KHÔNG dùng data-testid. Locator: getByRole(name) > getByLabel > getByPlaceholder
  > getByText > CSS ổn định (#id, [name])
- Xpath chỉ khi không còn cách, kèm // TODO locator
- Mỗi expected có ít nhất 1 expect(); màn hình trong feature.json có toHaveScreenshot khi tester đã duyệt baseline
- Cấm waitForTimeout; không sinh bước đăng nhập (đã có storageState)
- Credential đọc từ process.env, không hard-code giá trị
- Chạy thử: `npm run cli -- run-spec --feature <feature> --id <id> --run-dir <đợt>` (in log đã che credential)
- KHÔNG nới hoặc xóa assertion để ép pass; fail thì báo lại cho tester

## Đối chiếu Figma
- Dùng skill ui-check; ảnh thiết kế ở features/<feature>/figma/<screen>.png
- Thiếu ảnh Figma cho màn nào thì báo tester, không tự bỏ qua âm thầm

## Kiểm tra giao diện không cần Figma
- Dùng skill `ui-audit` (`/ui-audit <url | feature> [screen]`). Tester có thể chỉ chat, không mở UI
- Chưa có tính năng: `npm run cli -- feature-init --feature <f> --url <url>`. Khai báo `theme` trong feature.json trước khi đo
- Đo và chụp chỉ bằng `npm run cli -- audit --feature <f>`. Kết quả ở `<đợt>/ui-audit/<screen>/`
- Được bấm thử link nghi lỗi bằng agent-browser (session `ui-audit-<f>`). Không điền form, không gửi dữ liệu
- Quy chuẩn: `features/<f>/ui-audit-standards.md` nếu có, không thì `.claude/skills/ui-audit/references/standards.md`
- `report.md` để trống mục "Quyết định của tester"

## Healing
- Dùng skill `heal-locator` (`/heal-locator <feature> <id>`). Nhắc tester phân loại trước: bug thật, locator hỏng hay UI đổi có chủ đích
- Chỉ đề xuất sửa locator, giữ nguyên assertion và luồng test; đầu ra `<đợt>/heal/<id>.diff` và `<id>.md`. Bug thật thì không tạo diff
- KHÔNG sửa trực tiếp spec, KHÔNG đổi expect, KHÔNG bỏ bước, KHÔNG waitForTimeout
- Tester duyệt mới áp dụng: nút "Áp dụng và chạy lại" trên UI (`POST /api/runs/<đợt>/heal/<id>/apply`), tool sao lưu spec sang `heal/<id>.spec.ts.bak` (lần áp sau là `.bak.2`, `.bak.3`) rồi chạy lại spec
- Chỉ đọc `playwright-log.txt` và `playwright-results.json` của đợt (tool đã che credential). Không mở `playwright-report/` và `test-results/`: trace và report có thể chứa giá trị đã nhập
