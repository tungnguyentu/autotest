# Skill trong Claude Code

Sáu skill nằm ở `.claude/skills/<tên>/SKILL.md`. Tester chat với Claude Code mở ở thư mục project. Claude chọn skill theo việc tester nói, hoặc tester gõ lệnh slash. Kết quả của mọi skill là ĐỀ XUẤT. Tester quyết định bằng chat, và Claude ghi quyết định qua lệnh CLI tương ứng (bảng câu nói ở [CLAUDE.md](../CLAUDE.md)).

Điều cấm chung cho mọi skill: không đọc hay in `features/*/.env` và `auth/`, không tự vượt SSO, OTP, captcha, không tự đổi baseline, không tự đổi status sang `automated`, không nới hay xóa assertion để ép pass.

Mọi lệnh CLI gọi qua `npm run cli -- <lệnh>`. Xem `npm run cli -- help` và [README.md](./README.md).

## gen-testcases

| | |
| --- | --- |
| Lệnh | `/gen-testcases <feature>` |
| Đầu vào | `features/<f>/usecases/*.md` (file `.docx` tester kéo vào chat được `usecase-add` chuyển sang `.md`, ảnh ở `<tên>.images/`), `features/<f>/feature.json`, `testcases.json` hiện có |
| Đầu ra | Test case mới trong `features/<f>/testcases.json`, `status: draft` |
| Điều cấm | Ghi đè hoặc sửa test case có sẵn. Đặt status khác `draft`. Bịa test data không có trong use case mà không đánh dấu |
| Lệnh CLI | `validate-testcases`. Tester duyệt bằng chat: Claude chạy `testcase-status` khi tester nói "duyệt TC_X" hoặc "duyệt hết" |

## run-testcase

| | |
| --- | --- |
| Lệnh | `/run-testcase <feature> <id>` |
| Đầu vào | Test case `reviewed` (không `manual`), `feature.json`, `auth/<f>.json` nếu screen cần đăng nhập, `features/<f>/.env` (chỉ qua `fill-secret`) |
| Đầu ra | `<đợt>/ai-run/<id>.json` (step kèm thuộc tính element), `<đợt>/ai-run/<id>.md`, ảnh `<đợt>/screenshots/<id>/` |
| Điều cấm | Tự gõ `agent-browser click/fill/open` cho bước của test case (phải qua `record-step`). Tự điền credential. Dùng browser-use hoặc Playwright MCP. Kết luận đạt cuối cùng |
| Lệnh CLI | `run-start`, `record-step`, `fill-secret`, `run-finish`. Dùng thêm `agent-browser --session ui-check-<f> open, set viewport, snapshot -i`. Tester xác nhận bằng chat: Claude chạy `ai-decision` khi tester nói "xác nhận TC_X" hoặc "từ chối TC_X, lý do ..." |

## to-playwright

| | |
| --- | --- |
| Lệnh | `/to-playwright <feature> <id>` |
| Đầu vào | `<đợt>/ai-run/<id>.json` có `tester.decision = "confirmed"` |
| Đầu ra | `tests/<f>/<id>.spec.ts`, tên test bắt đầu bằng ID, kèm kết quả chạy thử |
| Điều cấm | Dùng `data-testid`. Dùng `waitForTimeout`. Sinh bước đăng nhập. Hard-code credential. Ghi đè spec có sẵn khi chưa hỏi. Xpath không kèm `// TODO locator` |
| Lệnh CLI | `run-spec --feature <f> --id <id> --run-dir <đợt>` để chạy thử (log đã che credential). Không chạy `npx playwright test` trực tiếp. Tester nói "đưa TC_X vào regression" thì Claude chạy `automate`. Chạy cả tính năng bằng `regression` |

Thứ tự locator: `getByRole` có name, `getByLabel`, `getByPlaceholder`, `getByText`, CSS ổn định.

## ui-check

| | |
| --- | --- |
| Lệnh | `/ui-check <feature> [screen]` |
| Đầu vào | `<đợt>/ui-diff/<screen>/` có `metrics.json`, `meta.json`, `side_by_side.png`, `crops/` (tạo bằng lệnh `ui-diff`) |
| Đầu ra | `<đợt>/ui-diff/<screen>/report.md` với bảng "Sai khác đề xuất", mục "Quyết định của tester" để trống |
| Điều cấm | Chụp hoặc so ảnh. Ghi đè `report.md` khi chưa được đồng ý. Ghi hay sửa `decisions.json` (việc của `ui-decision`). Coi pixel diff là tiêu chí đạt |
| Lệnh CLI | Skill không chụp và không so. Claude chạy `ui-diff --feature <f> --screen <screen>` (gồm `capture` và `compare`) trước khi dùng skill. Sau khi skill ghi `report.md`, tester trả lời từng mục trong chat và Claude chạy `ui-decision`, rồi `summary`. Tester nói "tạo baseline <screen>" thì Claude chạy `baseline`. Ảnh Figma do tester kéo vào chat |

## ui-audit

| | |
| --- | --- |
| Lệnh | `/ui-audit <url hoặc feature> [screen]` |
| Đầu vào | URL hoặc `features/<f>/feature.json`. Không cần Figma, không cần use case. Quy chuẩn: `.claude/skills/ui-audit/references/standards.md`, hoặc `features/<f>/ui-audit-standards.md` nếu tester viết |
| Đầu ra | `<đợt>/ui-audit/<screen>/report.md` với bảng quy chuẩn và bảng sai khác đề xuất, mục "Quyết định của tester" để trống |
| Điều cấm | Kết luận ĐẠT hay KHÔNG ĐẠT. Gửi form, đăng nhập, tạo dữ liệu trên site. Tự viết script đo thay cho lệnh `audit` |
| Lệnh CLI | `feature-init` (khi chưa có tính năng), `audit`. Thử link nghi lỗi bằng agent-browser, session `ui-audit-<f>` |

## heal-locator

| | |
| --- | --- |
| Lệnh | `/heal-locator <feature> <id> [đợt]` |
| Đầu vào | `tests/<f>/<id>.spec.ts`, `<đợt>/playwright-log.txt`, `<đợt>/playwright-results.json` (đợt mới nhất của feature nếu không chỉ định), `auth/<f>.json` |
| Đầu ra | `<đợt>/heal/<id>.diff` (unified diff chỉ đổi dòng locator) và `<đợt>/heal/<id>.md` (lý do mỗi hunk). Bug thật hoặc luồng đổi: chỉ `.md`, không có diff |
| Điều cấm | Đổi `expect(...)`. Bỏ, thêm hoặc đổi thứ tự bước. `waitForTimeout`. `force: true`. Sửa trực tiếp spec. Tự áp dụng |
| Lệnh CLI | Skill dùng `agent-browser --session ui-check-<f> --state auth/<f>.json open, snapshot -i, close` và `diff -u`. Tester đọc diff trong chat. Tester nói "áp dụng sửa locator TC_X" thì Claude chạy `heal-apply --feature <f> --id <id> --run-dir <đợt>` |

Thứ tự tìm element thay thế: role và name, label, placeholder, text, CSS. Skill nhắc tester phân loại trước: bug thật, locator hỏng hay UI đổi có chủ đích.

Áp dụng do lệnh `heal-apply` làm, không phải skill. Lệnh kiểm tra diff và từ chối nếu diff đụng `expect(`, `waitForTimeout`, `force:`, xóa dòng `await`, đổi số dòng, đổi dòng không có locator, hoặc đổi phần ngoài biểu thức locator như tên hành động và giá trị nhập. Lệnh lưu spec cũ ở `<đợt>/heal/<id>.spec.ts.bak` (lần áp sau là `.bak.2`, `.bak.3`, không đè bản trước), áp diff, rồi chạy lại spec. Lệnh tự áp diff, không dùng `git` hay `patch`. Mã nguồn: `tool/core/heal-apply.ts`.
