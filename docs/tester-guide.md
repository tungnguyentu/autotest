# Hướng dẫn cho tester

Tài liệu này dành cho người không đọc code. Làm theo thứ tự. Mỗi bước ghi rõ làm ở đâu, gõ lệnh gì, kết quả nằm ở file nào.

## 1. Cài đặt (làm một lần)

1. Cài Node 26 trở lên. Kiểm tra: `node --version`.
2. Mở terminal ở thư mục project, chạy:

   ```bash
   npm install
   npx playwright install chromium
   ```

3. Cài agent-browser (công cụ để AI mở trình duyệt). Kiểm tra: `agent-browser --version`. Chưa có thì cài theo hướng dẫn của agent-browser, bản đang dùng là 0.34.
4. Cài Claude Code và đăng nhập bằng tài khoản của bạn. Mở Claude Code ngay trong thư mục project này. Skill nằm ở `.claude/skills/`, Claude Code tự nhận.
5. Chạy tool: `npm start`. Mở http://localhost:4173. Dừng tool bằng Ctrl+C.

Cổng 4173 bận thì `npm start` in ra tiến trình đang giữ cổng. Dừng tiến trình đó rồi chạy lại. Tool không tự đổi cổng.

## 2. Bảo mật: đọc trước khi làm

- `features/<tính năng>/.env` chứa mật khẩu. `auth/` chứa phiên đăng nhập. `evidence/` có thể chứa ảnh có dữ liệu thật.
- Ba nơi này KHÔNG copy, KHÔNG gửi qua chat hay email, KHÔNG nén gửi đi, KHÔNG dán nội dung vào đâu.
- Project chưa dùng git, nên không có `.gitignore` bảo vệ. Khi chia sẻ project, copy từng thư mục cần thiết, đừng copy cả project.
- Đừng mở `.env` và `auth/` bằng Claude Code. AI chỉ được dùng tên biến, ví dụ `USER_PASSWORD`, không bao giờ thấy giá trị.
- Report HTML (`<đợt>/playwright-report/`) và trace (`<đợt>/test-results/**/trace.zip`) do Playwright tự ghi, tool không che được. Nếu spec nạp credential từ `process.env` (ví dụ `fill(process.env.USER_PASSWORD!)`), report và trace có thể chứa giá trị đã nhập. Đừng gửi hai thư mục này đi, đừng dán nội dung vào chat, đừng cho AI mở chúng. `playwright-log.txt` và `playwright-results.json` thì tool đã che.
- Ảnh chụp từng step và ảnh so Figma không che giá trị ô nhập không phải mật khẩu, ví dụ email hay tên tài khoản test. Đây là quyết định có chủ đích (2026-10-07). Mật khẩu luôn đi qua `fill-secret` và ô mật khẩu hiển thị dạng ẩn.

## 3. Quy trình sáu giai đoạn

Có hai điểm duyệt bắt buộc. AI chỉ đề xuất, bạn quyết định.

| # | Giai đoạn | Làm ở đâu | Kết quả ở file |
| --- | --- | --- | --- |
| 1 | Chuẩn bị tính năng | UI | `features/<f>/feature.json`, `usecases/*.md` (hoặc `.docx` đã chuyển), `auth/<f>.json` |
| 2 | Sinh và duyệt test case | Claude Code, rồi UI | `features/<f>/testcases.json` |
| 3 | AI chạy thử và xác nhận | Claude Code, rồi UI | `<đợt>/ai-run/<id>.json`, `.md`, ảnh |
| 4 | Chuyển sang Playwright | Claude Code, rồi UI | `tests/<f>/<id>.spec.ts` |
| 5 | So UI với Figma | UI, Claude Code, rồi UI | `<đợt>/ui-diff/<screen>/` |
| 6 | Regression và tổng kết | UI | `<đợt>/summary.md`, `playwright-report/` |

Hai điểm duyệt: duyệt test case (giai đoạn 2) và xác nhận kết quả AI chạy thử (giai đoạn 3). Ngoài ra bạn còn quyết định từng sai khác UI, cho tạo baseline, và áp dụng sửa locator.

Trang nào cũng có ô "Bước tiếp theo". Ô này nói bạn cần làm gì và đưa sẵn lệnh để copy.

### Giai đoạn 1. Chuẩn bị tính năng

Làm trên UI (http://localhost:4173).

1. Trang chủ, bấm "Tạo tính năng". Điền tên (chữ, số, `-`, `_`, không kết thúc bằng `_r` kèm số vì trùng tên đợt vòng N), tên service, baseURL của môi trường, kích thước viewport.
2. Trang tính năng, khu Screens: thêm từng màn hình (đường dẫn, có cần đăng nhập không).
3. Khu Use case: tải file use case lên, dạng `.md` hoặc `.docx`. Tool chuyển file Word sang `.md` cùng tên, tách ảnh vào thư mục `<tên>.images/`, giữ file gốc. Mở file `.md` xem lại bảng và ảnh trước khi sinh test case. File `.doc` cũ: mở bằng Word, lưu lại dạng `.docx`. Sửa use case thì sửa file Word, đổi tên rồi tải lại, vì tool không ghi đè file có sẵn.
4. Đăng nhập tay (xem mục 4).
5. Export ảnh Figma (xem mục 5).
6. Bấm "Tạo đợt mới". Mỗi lần test là một đợt, thư mục `evidence/<ngày>_<tính năng>/`.

### Giai đoạn 2. Sinh và duyệt test case (điểm duyệt 1)

1. Claude Code: `/gen-testcases <tính năng>`. AI ghi test case mới ở trạng thái `draft`.
2. UI, trang test case: đọc từng test case, sửa nếu cần. Đúng thì duyệt thành `reviewed`. Sai thì để `draft` hoặc sửa.

AI chỉ chạy test case đã `reviewed`.

### Giai đoạn 3. AI chạy thử và xác nhận (điểm duyệt 2)

1. Claude Code: `/run-testcase <tính năng> <id>`. AI mở trình duyệt, làm từng bước, chụp ảnh. Làm lần lượt từng test case.
2. UI, trang đợt, khu "AI chạy thử": xem từng bước và ảnh, đọc kết quả AI đề xuất. Bấm "Xác nhận" hoặc "Từ chối", kèm ghi chú. Nghi có bug thì điền ô "Nghi bug", tool ghi vào `<đợt>/bugs.md`.

Gặp OTP hay captcha, AI dừng và ghi "CẦN TESTER ĐĂNG NHẬP LẠI". Đăng nhập lại theo mục 4 rồi chạy lại lệnh.

### Giai đoạn 4. Chuyển sang Playwright

1. Claude Code: `/to-playwright <tính năng> <id>`. Chỉ chuyển test case bạn đã xác nhận. AI tạo `tests/<f>/<id>.spec.ts` và chạy thử.
2. UI, khu "Playwright": bấm "Chạy spec". Pass thì bấm "Đưa vào regression". Fail thì xem mục 7.

### Giai đoạn 5. So UI với Figma

1. UI, khu "So UI với Figma": tick screen, bấm "Chụp và so".
2. Claude Code: `/ui-check <tính năng> <screen>`. AI xem ảnh và ghi `report.md`.
3. UI: với từng dòng "Sai khác đề xuất", chọn bug, chấp nhận hoặc cần xem. Bấm "Lưu quyết định".
4. Khi UI khớp thiết kế, bấm "Cho tạo baseline". Cần có spec chứa `toHaveScreenshot('<screen>.png')` trong `tests/<f>/`. Còn dòng nào đánh dấu "Bug" thì tool chặn baseline. Báo bug, chờ sửa, chụp và so lại, hoặc đổi quyết định nếu đánh nhầm.

### Giai đoạn 6. Regression và tổng kết

1. UI, khu "Playwright": bấm "Regression (chạy mọi spec)". Chạy hai lần liên tiếp, cả hai phải pass.
2. Trang đợt, khu "Tổng kết đợt": bấm "Sinh lại từ dữ liệu của đợt", rồi điền "Kết luận của tester". Mục này chỉ bạn điền.

## 4. Đăng nhập tay

AI không được vượt SSO, OTP, captcha. Bạn đăng nhập, tool lưu phiên.

1. Trang tính năng, khu Đăng nhập, bấm "Mở browser". Cửa sổ Chromium hiện ra.
2. Đăng nhập như bình thường (tên, mật khẩu, OTP). Chờ vào đến trang chính.
3. Bấm "Lưu phiên" trên UI. Phiên lưu ở `auth/<f>.json`, cửa sổ tự đóng.

Dùng terminal thay UI: `npm run cli -- login --feature <f>`, đăng nhập xong bấm Enter. Kiểm tra phiên còn dùng được: `npm run cli -- check-session --feature <f> --url <url>`. Mã thoát 0 là còn dùng được.

Đăng nhập lại khi:

- Spec hoặc AI bị đẩy về trang đăng nhập.
- AI báo "CẦN TESTER ĐĂNG NHẬP LẠI".
- `check-session` báo không đạt.
- Đã đổi tài khoản hoặc môi trường.

Mỗi tính năng một phiên riêng. Không dùng chung giữa các tính năng.

## 5. Export Figma

Làm một lần cho mỗi screen.

- Export frame ở tỉ lệ 1x, định dạng PNG.
- Chiều rộng ảnh bằng đúng chiều rộng viewport của tính năng.
- Đặt ở `features/<f>/figma/<screen>.png`. Tên file là tên screen trong `feature.json`.
- Frame dài hơn viewport thì tick ô "Chụp cả trang" trước khi bấm "Chụp và so".
- Export 2x thì đặt `scale: 2` cho screen đó. Nên dùng 1x.
- Ghi link frame và ngày export vào `features/<f>/figma/README.md` (bạn tự tạo, tool không đọc).

## 6. Cách đọc kết quả

| File | Là gì | Cách đọc |
| --- | --- | --- |
| `<đợt>/ai-run/<id>.md` | Báo cáo AI chạy thử | Đầu file có kết quả AI đề xuất (ĐẠT, KHÔNG ĐẠT, KHÔNG XÁC ĐỊNH). Bảng bên dưới: từng kết quả mong đợi, AI thấy gì, ảnh. Xem mục "Ghi chú cho tester" trước. Ảnh là bằng chứng, đối chiếu với kết luận |
| `<đợt>/ui-diff/<screen>/report.md` | Sai khác UI AI đề xuất | Mỗi dòng có mức (Cao, Trung bình, Thấp) và phân loại. Mức Cao ảnh hưởng chức năng hoặc nhận diện. "Có thể chấp nhận" như dữ liệu mẫu khác nhau. Bạn quyết định từng dòng trên UI |
| `<đợt>/summary.md` | Tổng kết đợt | Bảng test case, bảng sai khác UI, vấn đề kỹ thuật. "Kết luận của tester" bạn điền |
| `<đợt>/playwright-report/` | Report Playwright | Mở ngay trong khu "Playwright". Test fail có ảnh và trace |
| `<đợt>/playwright-log.txt` | Log lần chạy gần nhất | Tìm dòng bắt đầu bằng `Error:` và dòng có dấu `>` |
| `<đợt>/bugs.md` | Bug bạn nghi ngờ | Mỗi test case một mục |

Mở trace của test fail: copy lệnh `npx playwright show-trace ...` ở khu "Playwright" và chạy trong terminal.

Pixel diff chỉ khoanh vùng khác nhau. Nó không nói UI đạt hay không. Vùng đỏ có thể chỉ là dữ liệu động.

## 7. Khi spec fail

Phân loại trước, rồi mới làm gì.

| Loại | Dấu hiệu | Việc làm |
| --- | --- | --- |
| Bug thật | Chức năng sai. Ảnh test-results cho thấy lỗi thật | Ghi vào `bugs.md`, báo dev. Không sửa spec |
| Locator hỏng | Lỗi "không tìm thấy element" mà chức năng vẫn chạy bình thường. Nút đổi tên, đổi nhãn | Chạy `/heal-locator <f> <id>` trong Claude Code (lệnh có sẵn trên UI, khu "Sửa locator") |
| UI đổi có chủ đích | Luồng hoặc màn hình khác thiết kế cũ | Cập nhật test case và use case, chạy lại `/run-testcase`, `/to-playwright` |

Với locator hỏng:

1. Chạy `/heal-locator <f> <id>`. AI mở trang, tìm element tương đương, ghi `<đợt>/heal/<id>.diff` và `<id>.md`.
2. UI, khu "Sửa locator": đọc diff (dòng đỏ bị xóa, dòng xanh thêm) và lý do.
3. Chấp nhận thì bấm "Áp dụng và chạy lại". Tool lưu bản cũ ở `<đợt>/heal/<id>.spec.ts.bak`, sửa spec, chạy lại.
4. Spec vẫn fail ở dòng khác thì chạy lại lệnh. Để quay về bản cũ, chép `.bak` đè lên `tests/<f>/<id>.spec.ts`.

Tool từ chối áp dụng nếu diff đụng vào `expect(`, bỏ một bước, hoặc đổi dòng không phải locator. Khi đó đừng ép. Phân loại lại: nhiều khả năng là bug thật hoặc UI đổi.

AI không bao giờ sửa kết quả mong đợi để ép test pass.

## 8. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| Cổng 4173 bận | Dừng tiến trình cũ (tool in ra), chạy lại `npm start` |
| Báo 409 "Playwright đang chạy" | Chờ xong hoặc bấm "Dừng". Mỗi lúc chỉ một lần chạy |
| Spec chạy ra trang đăng nhập | Phiên hết hạn. Đăng nhập lại (mục 4) |
| Không thấy lệnh `/gen-testcases` trong Claude Code | Mở Claude Code ở đúng thư mục project |
| Thiếu ảnh Figma | UI báo cảnh báo ở screen đó. Export và đặt đúng đường dẫn (mục 5) |
