---
name: to-playwright
description: Chuyển kết quả AI chạy thử đã được tester xác nhận thành spec Playwright tests/<feature>/<id>.spec.ts, chạy thử và báo kết quả. Dùng khi người dùng gõ /to-playwright <feature> <id>, hoặc nhờ "chuyển test case sang Playwright", "sinh spec từ ai-run", "tạo file .spec.ts", "tự động hóa test case đã xác nhận".
---

# to-playwright: ai-run đã xác nhận thành spec Playwright

Lệnh: `/to-playwright <feature> <id>`. Đầu vào là `ai-run/<id>.json` mà tester đã xác nhận. Đầu ra là `tests/<feature>/<id>.spec.ts` để tester duyệt trước khi đưa vào regression. Quy tắc chuyển đổi chi tiết: `references/playwright-conversion.md`.

## Quy trình

### 1. Tìm ai-run và kiểm tra điều kiện

```bash
ls -dt "${EVIDENCE_ROOT:-evidence}"/????-??-??_<feature>/ai-run/<id>.json "${EVIDENCE_ROOT:-evidence}"/????-??-??_<feature>_r[0-9]*/ai-run/<id>.json 2>/dev/null | head -1
```

Đọc file đó và test case `<id>` trong `features/<feature>/testcases.json`. Dừng, không sinh spec, nếu:

- Không có `ai-run/<id>.json`: nhờ tester chạy `/run-testcase <feature> <id>`.
- `tester.decision` khác `"confirmed"` (còn `null` hoặc `"rejected"`): nói rõ tester cần xác nhận kết quả AI chạy thử trước. Không tự sửa `tester` trong file để vượt qua điều kiện này.
- `ai_result` là `null`, hoặc `ai_result.verdict` là `KHÔNG XÁC ĐỊNH` mà tester chưa ghi lý do chấp nhận trong `tester.note`.
- `ai_result.verdict` là `KHÔNG ĐẠT` (tester xác nhận đó là bug): hỏi tester có muốn chuyển không, vì spec sẽ fail cho tới khi lỗi được sửa.
- Có step với `target` thiếu `role` lẫn `name` mà cũng không có `label`, `placeholder`, `css`: step đó không đủ thông tin để chọn locator, báo tester chạy lại hoặc bổ sung.

Đã có `tests/<feature>/<id>.spec.ts`: không ghi đè. Báo tester và hỏi có muốn thay không.

### 2. Sinh spec

Đọc `references/playwright-conversion.md` rồi viết `tests/<feature>/<id>.spec.ts` theo đó. Tóm tắt các quy tắc không được lệch:

- Tên test bắt đầu bằng ID: `test('<id> - <title>', ...)`.
- Locator theo thứ tự: `getByRole(role, { name })`, `getByLabel`, `getByPlaceholder`, `getByText`, CSS ổn định (`#id`, `[name]`). Không `data-testid`. Xpath hoặc locator yếu thì kèm `// TODO locator: <lý do>`.
- Mỗi dòng `expected` có ít nhất một `expect()`.
- Không `page.waitForTimeout`. Không sinh bước đăng nhập (phiên đã nạp qua `storageState`).
- Credential: `<secret:KEY>` thành `process.env.KEY!`. Không ghi giá trị vào spec.
- Spec không import file ngoài `@playwright/test`.

### 3. Chạy thử

```bash
npm run cli -- run-spec --feature <feature> --id <id> --run-dir <đợt chứa ai-run>
```

`<đợt>` là thư mục cha của `ai-run/` ở bước 1. Chỉ chạy bằng lệnh này, không chạy `npx playwright test` trong shell: lệnh `run-spec` che credential trong log và trong `playwright-results.json`, còn chạy trực tiếp thì thông báo lỗi có thể in giá trị đã nhập vào ngữ cảnh của bạn. Mã thoát 0 là pass, 2 là fail. Báo kết quả đúng như thực tế.

- Fail: đọc lỗi. Nếu do locator chuyển sai (strict mode violation, sai tên role, sai `exact`), sửa locator và chạy lại tối đa hai lần. Nếu fail do assertion hoặc hành vi hệ thống khác với lúc AI chạy thử, dừng và báo tester kèm thông báo lỗi. Không nới, không xóa, không đổi giá trị mong đợi trong assertion để ép pass.
- Pass: báo pass. Không cập nhật snapshot (`--update-snapshots`), không tạo baseline.
- Phiên hết hạn (về trang đăng nhập): dừng, nhờ tester chạy `npm run cli -- login --feature <feature>`.

### 4. Báo cáo cho tester

Trả lời ngắn gọn:

- Đường dẫn spec, kết quả chạy (pass hoặc fail, thời gian), đường dẫn report `<đợt>/playwright-report/index.html`.
- Số locator theo loại: role, label, placeholder, text, css.
- Mọi `// TODO locator` và lý do, mọi assertion suy ra từ quan sát mà không có step `assert_*` tương ứng, mọi bước không chuyển được.
- Việc còn lại của tester: đọc spec, duyệt, và tự đặt `status: automated` trên UI. Skill không đổi status.

## Không được làm

- Chuyển test case mà `tester.decision` chưa là `"confirmed"`.
- Nới, xóa, hoặc đổi assertion để test pass.
- Ghi giá trị credential vào spec, hay đọc `features/*/.env` và `auth/`.
- Dùng `data-testid`, `waitForTimeout`, hay sinh bước đăng nhập.
- Đổi `status` test case sang `automated`, sửa baseline, chạy `--update-snapshots`.
- Sửa `ai-run/<id>.json`.
