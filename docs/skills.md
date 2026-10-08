# Skill trong Claude Code

Năm skill nằm ở `.claude/skills/<tên>/SKILL.md`. Tester gõ lệnh trong Claude Code mở ở thư mục project. Kết quả của mọi skill là ĐỀ XUẤT, tester quyết định.

Điều cấm chung cho mọi skill: không đọc hay in `features/*/.env` và `auth/`, không tự vượt SSO, OTP, captcha, không tự đổi baseline, không tự đổi status sang `automated`, không nới hay xóa assertion để ép pass.

Mọi lệnh CLI gọi qua `npm run cli -- <lệnh>`. Xem `npm run cli -- help` và [README.md](./README.md).

## gen-testcases

| | |
| --- | --- |
| Lệnh | `/gen-testcases <feature>` |
| Đầu vào | `features/<f>/usecases/*.md` (file tải lên dạng `.docx` được tool chuyển sang `.md`, ảnh ở `<tên>.images/`), `features/<f>/feature.json`, `testcases.json` hiện có |
| Đầu ra | Test case mới trong `features/<f>/testcases.json`, `status: draft` |
| Điều cấm | Ghi đè hoặc sửa test case có sẵn. Đặt status khác `draft`. Bịa test data không có trong use case mà không đánh dấu |
| Lệnh CLI | `validate-testcases` |

## run-testcase

| | |
| --- | --- |
| Lệnh | `/run-testcase <feature> <id>` |
| Đầu vào | Test case `reviewed` (không `manual`), `feature.json`, `auth/<f>.json` nếu screen cần đăng nhập, `features/<f>/.env` (chỉ qua `fill-secret`) |
| Đầu ra | `<đợt>/ai-run/<id>.json` (step kèm thuộc tính element), `<đợt>/ai-run/<id>.md`, ảnh `<đợt>/screenshots/<id>/` |
| Điều cấm | Tự gõ `agent-browser click/fill/open` cho bước của test case (phải qua `record-step`). Tự điền credential. Dùng browser-use hoặc Playwright MCP. Kết luận đạt cuối cùng |
| Lệnh CLI | `run-start`, `record-step`, `fill-secret`, `run-finish`. Dùng thêm `agent-browser --session ui-check-<f> open, set viewport, snapshot -i` |

## to-playwright

| | |
| --- | --- |
| Lệnh | `/to-playwright <feature> <id>` |
| Đầu vào | `<đợt>/ai-run/<id>.json` có `tester.decision = "confirmed"` |
| Đầu ra | `tests/<f>/<id>.spec.ts`, tên test bắt đầu bằng ID, kèm kết quả chạy thử |
| Điều cấm | Dùng `data-testid`. Dùng `waitForTimeout`. Sinh bước đăng nhập. Hard-code credential. Ghi đè spec có sẵn khi chưa hỏi. Xpath không kèm `// TODO locator` |
| Lệnh CLI | `run-spec --feature <f> --id <id> --run-dir <đợt>` để chạy thử (log đã che credential). Không chạy `npx playwright test` trực tiếp |

Thứ tự locator: `getByRole` có name, `getByLabel`, `getByPlaceholder`, `getByText`, CSS ổn định.

## ui-check

| | |
| --- | --- |
| Lệnh | `/ui-check <feature> [screen]` |
| Đầu vào | `<đợt>/ui-diff/<screen>/` có `metrics.json`, `meta.json`, `side_by_side.png`, `crops/` (tạo bằng nút "Chụp và so" trên UI) |
| Đầu ra | `<đợt>/ui-diff/<screen>/report.md` với bảng "Sai khác đề xuất", mục "Quyết định của tester" để trống |
| Điều cấm | Chụp hoặc so ảnh. Ghi đè `report.md` khi chưa được đồng ý. Sửa `decisions.json`. Coi pixel diff là tiêu chí đạt |
| Lệnh CLI | Không gọi lệnh `npm run cli` nào. Tool chạy `capture` và `compare` qua UI |

## heal-locator

| | |
| --- | --- |
| Lệnh | `/heal-locator <feature> <id> [đợt]` |
| Đầu vào | `tests/<f>/<id>.spec.ts`, `<đợt>/playwright-log.txt`, `<đợt>/playwright-results.json` (đợt mới nhất của feature nếu không chỉ định), `auth/<f>.json` |
| Đầu ra | `<đợt>/heal/<id>.diff` (unified diff chỉ đổi dòng locator) và `<đợt>/heal/<id>.md` (lý do mỗi hunk). Bug thật hoặc luồng đổi: chỉ `.md`, không có diff |
| Điều cấm | Đổi `expect(...)`. Bỏ, thêm hoặc đổi thứ tự bước. `waitForTimeout`. `force: true`. Sửa trực tiếp spec. Tự áp dụng |
| Lệnh CLI | Không gọi `npm run cli`. Dùng `agent-browser --session ui-check-<f> --state auth/<f>.json open, snapshot -i, close` và `diff -u` |

Thứ tự tìm element thay thế: role và name, label, placeholder, text, CSS. Skill nhắc tester phân loại trước: bug thật, locator hỏng hay UI đổi có chủ đích.

Áp dụng do tool làm, không phải skill. `POST /api/runs/<đợt>/heal/<id>/apply` kiểm tra diff (từ chối 409 nếu đụng `expect(`, `waitForTimeout`, xóa dòng `await`, đổi số dòng, đổi dòng không có locator, thêm `force:`, hoặc đổi phần ngoài biểu thức locator như tên hành động và giá trị nhập), lưu spec cũ ở `<đợt>/heal/<id>.spec.ts.bak` (lần áp sau là `.bak.2`, `.bak.3`, không đè bản trước), áp diff, chạy lại spec và trả kết quả. Tool tự áp diff, không dùng `git` hay `patch`.
