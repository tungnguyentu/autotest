---
name: ui-audit
description: Kiểm tra giao diện một trang web khi không có Figma và không có use case, ở theme sáng và tối, desktop và mobile, theo bộ quy chuẩn AI tự đặt (tương phản, tràn màn hình, ảnh, tiêu đề, link, console, nút đổi theme, phần tử nổi che nội dung). Ghi report.md đề xuất cho tester. Dùng khi người dùng gõ /ui-audit <url hoặc feature> [screen], hoặc nhờ "test giao diện trang này", "kiểm tra dark mode light mode", "xem trang có lỗi gì không", "audit UI", "không có figma tự đặt quy chuẩn".
---

# ui-audit: kiểm tra giao diện không cần Figma

Lệnh: `/ui-audit <url | feature> [screen]`. Kết quả là ĐỀ XUẤT. Tester quyết định từng mục. Không kết luận ĐẠT hay KHÔNG ĐẠT.

Phần đo và chụp do lệnh `npm run cli -- audit` làm. Skill này chuẩn bị cấu hình, chạy lệnh, xem ảnh bằng mắt, thử các link nghi lỗi, rồi viết `report.md`.

## Đọc trước khi làm

1. `CLAUDE.md`.
2. Quy chuẩn: `features/<feature>/ui-audit-standards.md` nếu tester đã viết. Không có thì dùng `references/standards.md`.
3. Mẫu báo cáo: `references/report-template.md`.

## Quy trình

### 1. Xác định tính năng

- Người dùng đưa URL: chọn tên tính năng ngắn từ tên miền, chữ thường và dấu `-`, ví dụ `bizfly-home`. Có sẵn `features/<tên>/feature.json` cùng baseURL thì dùng lại. Chưa có thì tạo:
  ```bash
  npm run cli -- feature-init --feature <tên> --url <url> [--screen <key>] [--auth]
  ```
  Thêm `--auth` khi trang cần đăng nhập. Trang cần đăng nhập mà chưa có `auth/<tên>.json`: làm quy trình đăng nhập qua chat trong `CLAUDE.md` (mục "Tester chỉ chat"), rồi làm tiếp.
- Người dùng đưa tên tính năng: đọc `features/<tên>/feature.json`. Không có thì hỏi URL.

### 2. Khai báo cách đổi theme

Bỏ qua bước này nếu `feature.json` đã có trường `theme`.

Trang không cần đăng nhập: tải HTML bằng `curl -sL <url>`. Trang cần đăng nhập (`auth: true`): curl chỉ nhận trang login, nên mở trang bằng agent-browser với `--state auth/<feature>.json` rồi đọc `document.documentElement.outerHTML`. Tìm trong HTML và script:

| Dấu hiệu | Khai báo `theme` |
| --- | --- |
| `localStorage.getItem("<key>")` gắn vào `data-theme`, `data-bs-theme`, class `dark` | `{"method": "localStorage", "key": "<key>", "light": "<giá trị sáng>", "dark": "<giá trị tối>"}` |
| Chỉ có CSS `@media (prefers-color-scheme: dark)` | `{"method": "media"}` |
| Không có theme tối | `{"method": "none"}` |

Có nút đổi theme thì thêm `"toggle": "<selector>"`. Ưu tiên `[data-testid=...]`, `[aria-label=...]`, `#id`. Ghi trường `theme` vào `feature.json` bằng công cụ sửa file. Không chắc cách site đổi theme thì mở trang bằng agent-browser (session `ui-audit-<feature>`), bấm nút đổi theme, đọc lại `localStorage` và thuộc tính của `<html>`.

### 3. Chạy đo và chụp

```bash
npm run cli -- audit --feature <feature> [--screen <key>] [--viewport tablet=768x1024]
```

Lệnh tạo đợt mới, in đường dẫn, rồi in tóm tắt từng tổ hợp viewport và theme. Đầu ra ở `<đợt>/ui-audit/<screen>/`:

| File | Nội dung |
| --- | --- |
| `checks.json` | Số đo từng tổ hợp: tương phản, tràn ngang, ảnh hỏng, ảnh thiếu alt, H1, tiêu đề nhảy cấp, link không đích, `rel` sai, phần tử nổi, khối nền sáng trong theme tối, console, lỗi JS, request lỗi. Kèm kết quả bấm nút đổi theme và theme khi hệ điều hành chọn tối |
| `review/<viewport>-NN.png` | Ảnh sáng (trái) và tối (phải) cạnh nhau, đã thu nhỏ, cắt theo đoạn từ đầu đến cuối trang |
| `shots/<viewport>-<theme>.png` | Ảnh toàn trang kích thước thật |
| `shots/<viewport>-<theme>-top.png`, `-bottom.png` | Một màn hình ở đầu và cuối trang, thấy nút nổi và header dính |

Có dòng `CẢNH BÁO` về theme (yêu cầu tối mà trang hiển thị sáng): sửa `theme` trong `feature.json` rồi chạy lại. Bị chuyển hướng tới trang đăng nhập: phiên hết hạn, làm quy trình đăng nhập qua chat trong `CLAUDE.md` (mục "Tester chỉ chat"), rồi chạy lại.

### 4. Xem ảnh bằng mắt

Mở lần lượt mọi file trong `review/` bằng công cụ đọc ảnh, rồi các ảnh `-top.png` và `-bottom.png`. Ảnh cần xem chi tiết thì cắt từ ảnh trong `shots/` (tọa độ `y` có trong `checks.json`). Với mỗi đoạn, so cột trái với cột phải theo `references/standards.md`:

- Khối hoặc ảnh còn nền trắng trong theme tối. Chữ, icon, logo tối màu nằm trên nền tối.
- Chữ khó đọc trên ảnh nền (script không đo được, `contrast.skipped_on_image`).
- Thành phần bị lệch, chồng nhau, cắt chữ, khoảng trống bất thường.
- Nút nổi hoặc header dính che chữ, số điện thoại, nút bấm (xem ảnh `-bottom.png` trên mobile).
- Phần chỉ có ở một theme.

Số đo trong `checks.json` là bằng chứng. Mỗi mục báo lỗi phải có ảnh hoặc số đo đi kèm. Không bịa màu, kích thước mà ảnh và số đo không cho thấy.

### 5. Thử các mục nghi lỗi chức năng

Với mỗi link trong `links.no_target`: mở trang bằng agent-browser, session `ui-audit-<feature>` (screen `auth: true` thì thêm `--state auth/<feature>.json`), bấm, chờ 2 giây, kiểm tra URL, popup, form. Chụp ảnh vào `<đợt>/ui-audit/<screen>/probe/NN.png`. Không điền form, không gửi dữ liệu. Đóng session khi xong: `agent-browser --session ui-audit-<feature> close`.

### 6. Viết `report.md`

Ghi `<đợt>/ui-audit/<screen>/report.md` theo `references/report-template.md`:

- Mục "Quy chuẩn": chép bảng quy chuẩn đã dùng để tester gạch dòng không áp dụng.
- Mục "Sai khác đề xuất": mỗi lỗi một dòng, gom các tổ hợp giống nhau (ví dụ "dark, desktop và mobile"). Mức Cao, Trung bình, Thấp. Phân loại "Sai khác thật", "Có thể chấp nhận", "Cần tester xác nhận". Lỗi phụ thuộc quyết định sản phẩm (theme mặc định, request 401 khi chưa đăng nhập) là "Cần tester xác nhận".
- Mục "Đã kiểm tra, không thấy lỗi" và "Chưa kiểm tra".
- Mục "Quyết định của tester" để trống.

### 7. Trả lời ngắn

Đường dẫn `report.md`, số mục theo mức, 3 lỗi đáng chú ý nhất, những gì chưa kiểm tra được.

## Không được làm

- Kết luận trang ĐẠT hay KHÔNG ĐẠT, chọn thay tester bug hay chấp nhận.
- Sửa mã nguồn của trang, gửi form, đăng nhập, tạo dữ liệu trên site.
- Tự vượt đăng nhập, OTP, captcha. Đọc `features/*/.env` và `auth/`.
- Xóa hay ghi đè đợt cũ trong `evidence/`.
- Tự viết script chụp hay đo thay cho `npm run cli -- audit`. Thiếu số đo nào thì ghi vào mục "Chưa kiểm tra".
