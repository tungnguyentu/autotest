# Spike tương thích phiên đăng nhập

Trạng thái: chờ tester

Mục tiêu: chứng minh `auth/staging.json` do lệnh `login` tạo nạp được ở ba nơi với cookie thật. Cần baseURL và tài khoản staging (có OTP). Việc này chưa làm được vì chưa có hai thứ đó.

## Chuẩn bị

1. Sửa `features/staging/feature.json`: đặt `baseURL` thật, sửa `screens` cho đúng đường dẫn cần đăng nhập (mọi screen `auth: true`).
2. Đặt `<URL đã đăng nhập>` bên dưới là một URL chỉ vào được khi đã đăng nhập, cùng origin với `baseURL`, ví dụ `<baseURL>/` hoặc trang dashboard.
3. Chạy lệnh đăng nhập. Nhập username, password, OTP trong browser mở ra, rồi bấm Enter ở terminal:

```bash
npm run cli -- login --feature staging
```

Kết quả: `auth/staging.json` và `auth/staging.meta.json` có mặt. Ghi URL cuối từ `auth/staging.meta.json`: ______

## Ba kiểm tra

Chạy ở thư mục gốc project. Không dán cookie hay token vào báo cáo này.

### 1. agent-browser

```bash
agent-browser --session spike --state auth/staging.json open "<URL đã đăng nhập>"
agent-browser --session spike get url
agent-browser --session spike screenshot spike-agent-browser.png
agent-browser --session spike close
```

Đạt khi `get url` trả về URL đã đăng nhập, không bị chuyển về trang login. Xóa `spike-agent-browser.png` sau khi xem.

- Kết quả (ĐẠT / KHÔNG ĐẠT): ______
- `get url` trả về: ______
- Thông báo lỗi nếu agent-browser từ chối file: ______

### 2. Playwright (script `check-session`)

```bash
npm run cli -- check-session --feature staging --url "<URL đã đăng nhập>"
```

Đạt khi dòng cuối là `KẾT QUẢ: ĐẠT` (mã thoát 0). Thêm `--headed` để xem bằng mắt.

- Kết quả (ĐẠT / KHÔNG ĐẠT): ______
- Dòng "URL cuối": ______
- Bị chuyển hướng / có ô mật khẩu: ______

### 3. `playwright.config.ts` và spec

```bash
FEATURE=staging npx playwright test
```

Chạy spec `tests/staging/session-check.spec.ts`: mở từng screen `auth: true` trong `feature.json`, kiểm tra URL không đổi và không có ô mật khẩu.

- Kết quả (ĐẠT / KHÔNG ĐẠT): ______
- Số test pass / fail: ______
- Thư mục đợt (in ở cuối report): ______

## Kết luận

- [ ] Cả ba đạt: file phiên dùng chung được, không cần chuyển đổi.
- [ ] agent-browser từ chối file: viết `tool/core/state-convert.ts` chuyển storageState sang định dạng agent-browser nhận, ghi lý do bên dưới.

Ghi chú của tester: ______
