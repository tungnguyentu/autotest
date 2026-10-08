# Hướng dẫn cho tester

Bạn chỉ chat với Claude Code. Bạn không cần gõ lệnh, không cần mở giao diện web. Claude chạy mọi lệnh, bạn đọc kết quả và quyết định.

## 1. Cài đặt (làm một lần)

1. Cài Node 26 trở lên, git, và Claude Code. Đăng nhập Claude Code bằng tài khoản của bạn.
2. Mở Claude Code ở thư mục bạn muốn để project, rồi chat:

   ```
   Clone https://github.com/tungnguyentu/autotest.git, cài đặt theo docs/tester-guide.md
   ```

   Claude tải project, chạy `npm ci` và cài trình duyệt Chromium cho Playwright.
3. Thoát Claude Code, mở lại ngay trong thư mục `autotest`. Từ lúc này Claude đọc được quy tắc của project và các skill.
4. agent-browser (trình duyệt AI dùng khi chạy thử test case và bấm thử link): nhờ Claude kiểm tra đã cài chưa. Bản đang dùng là 0.34.

## 2. Cập nhật tool

Khi người phát triển báo có bản mới, nói với Claude: "cập nhật tool". Claude tải bản mới và cài lại thư viện.

- Dữ liệu của bạn không bị đụng tới khi cập nhật: tính năng, use case, test case, spec (`features/`, `tests/`), kết quả các đợt (`evidence/`), phiên đăng nhập (`auth/`). Git bỏ qua các thư mục này.
- Dữ liệu này chỉ có trên máy bạn, không lên GitHub. Muốn đưa cho tester khác thì nén thư mục tính năng gửi riêng, trừ file `.env` và thư mục `auth/`.
- Đừng sửa file của tool (`tool/`, `.claude/`, `CLAUDE.md`, `docs/`). Sửa thì lần cập nhật sau bị kẹt. Muốn Claude làm khác đi trên máy bạn: nhờ Claude ghi vào `CLAUDE.local.md`. Muốn đổi tool cho mọi người: gửi yêu cầu cho người phát triển.
- Cập nhật báo có file của tool bị sửa: Claude dừng và nêu tên file. Gửi tên file đó cho người phát triển, đừng tự xóa.

## 3. Bảo mật: đọc trước khi làm

- `features/<tính năng>/.env` chứa mật khẩu. `auth/` chứa phiên đăng nhập. `evidence/` có thể chứa ảnh có dữ liệu thật.
- Ba nơi này KHÔNG copy, KHÔNG gửi qua chat hay email, KHÔNG nén gửi đi, KHÔNG dán nội dung vào đâu.
- `.gitignore` đã loại `features/`, `tests/`, `auth/` và `evidence/` khỏi git. Đừng đổi file này, đừng dùng `git add -f` cho các thư mục đó.
- Đừng mở `.env` và `auth/` bằng Claude Code. AI chỉ được dùng tên biến, ví dụ `USER_PASSWORD`, không bao giờ thấy giá trị.
- Report HTML (`<đợt>/playwright-report/`) và trace (`<đợt>/test-results/**/trace.zip`) do Playwright tự ghi, tool không che được. Nếu spec nạp credential từ `process.env` (ví dụ `fill(process.env.USER_PASSWORD!)`), report và trace có thể chứa giá trị đã nhập. Đừng gửi hai thư mục này đi, đừng dán nội dung vào chat, đừng cho AI mở chúng. `playwright-log.txt` và `playwright-results.json` thì tool đã che.
- Ảnh chụp từng step và ảnh so Figma không che giá trị ô nhập không phải mật khẩu, ví dụ email hay tên tài khoản test. Đây là quyết định có chủ đích (2026-10-07). Mật khẩu luôn đi qua `fill-secret` và ô mật khẩu hiển thị dạng ẩn.

## 4. Việc bạn nói với Claude

| Bạn muốn | Nói với Claude, ví dụ |
| --- | --- |
| Kiểm tra giao diện một trang, không có Figma và use case | "Test giao diện https://staging-home.bizflycloud.vn/ ở chế độ sáng và tối, xem có lỗi gì không" hoặc `/ui-audit <url>` |
| Nhìn thấy trình duyệt khi AI làm việc | "Mở trình duyệt khi chạy". Muốn chạy ẩn lại (nhanh hơn): "Chạy ẩn trình duyệt" |
| Đưa use case (file Word D5) | Kéo file vào chat: "Thêm use case này cho tính năng X: /Users/.../D5.docx" |
| Sinh test case từ use case | "Sinh test case cho tính năng X" |
| Đăng nhập trang cần SSO, OTP | "Đăng nhập tính năng X". Claude mở cửa sổ trình duyệt, bạn đăng nhập trên đó, xong thì trả lời "xong" |
| Biết đang tới đâu, làm gì tiếp | "Đang tới đâu?" hoặc "Làm gì tiếp?". Claude đọc tiến độ và nói việc tiếp theo |

Không gửi mật khẩu, mã OTP hay cookie vào chat. Bạn chỉ nhập chúng trên cửa sổ trình duyệt. Lỡ gửi thì đổi mật khẩu.

### Đọc kết quả kiểm tra giao diện

Claude mất khoảng 3 đến 5 phút một trang, rồi gửi đường dẫn `evidence/<ngày>_<tính năng>/ui-audit/<screen>/report.md`. Mở file đó:

- Mục "Quy chuẩn": AI tự đặt. Gạch dòng không áp dụng. Muốn đổi hẳn cho một tính năng: nói với Claude "dùng bộ quy chuẩn riêng cho tính năng X, bỏ Q8".
- Mục "Sai khác đề xuất": mỗi dòng có mức và bằng chứng (ảnh trong `review/` hoặc `shots/`, số đo trong `checks.json`). Đối chiếu ảnh trước khi tin.
- Mục "Quyết định của tester": bạn điền.

## 5. Quy trình sáu giai đoạn

Cả sáu giai đoạn làm bằng chat. Bạn nói, Claude chạy lệnh và báo kết quả, bạn mở file để đọc khi cần. Bạn không gõ lệnh, không mở trang web, không bấm nút.

Có hai điểm duyệt bắt buộc. AI chỉ đề xuất, bạn quyết định.

| # | Giai đoạn | Kết quả ở file |
| --- | --- | --- |
| 1 | Chuẩn bị tính năng | `features/<f>/feature.json`, `usecases/*.md`, `auth/<f>.json`, `figma/<screen>.png` |
| 2 | Sinh và duyệt test case | `features/<f>/testcases.json` |
| 3 | AI chạy thử và xác nhận | `<đợt>/ai-run/<id>.json`, `.md`, ảnh |
| 4 | Chuyển sang Playwright | `tests/<f>/<id>.spec.ts` |
| 5 | So UI với Figma | `<đợt>/ui-diff/<screen>/` |
| 6 | Regression và tổng kết | `<đợt>/summary.md`, `playwright-report/` |

Hai điểm duyệt: duyệt test case (giai đoạn 2) và xác nhận kết quả AI chạy thử (giai đoạn 3). Ngoài ra bạn còn quyết định từng sai khác UI, tạo baseline, đưa test case vào regression, áp dụng sửa locator, và viết kết luận của đợt.

Claude chỉ ghi quyết định khi bạn nói rõ mã test case hoặc screen và ý của bạn. Câu mơ hồ như "ok" hay "được" thì Claude hỏi lại. Claude không tự quyết định thay bạn để đi tiếp.

Lạc đường thì hỏi "Đang tới đâu?". Claude đọc tiến độ và nói việc tiếp theo.

### Bảng câu nói

| Bạn nói | Claude làm |
| --- | --- |
| "duyệt TC_X" hoặc "duyệt hết" | Đổi test case từ `draft` sang `reviewed` |
| "bỏ duyệt TC_X" | Đổi test case về `draft` |
| "xác nhận TC_X" | Ghi bạn xác nhận kết quả AI chạy thử. Status thành `ai-passed` |
| "từ chối TC_X, lý do ..." hoặc "nghi bug ..." | Ghi bạn từ chối kết quả AI. Status thành `ai-failed`. Nghi bug thì ghi thêm vào `<đợt>/bugs.md` |
| "đưa TC_X vào regression" | Đổi status thành `automated`. Chỉ được khi spec đã pass |
| "áp dụng sửa locator TC_X" | Áp bản sửa locator vào spec và chạy lại |
| "mục 1 chấp nhận, mục 2 bug lệch 8px, mục 3 cần xem" | Ghi quyết định từng sai khác UI |
| "tạo baseline <screen>" | Tạo ảnh baseline cho screen |
| "kết luận đợt: ..." và "tôi là <tên>" | Ghi đúng lời bạn vào `summary.md` |

### Giai đoạn 1. Chuẩn bị tính năng

1. Tạo tính năng. Nói: "Tạo tính năng X cho https://... ". Claude tạo `feature.json` từ URL. Tên tính năng chỉ dùng chữ, số, `-`, `_`, và không kết thúc bằng `_r` kèm số (trùng tên đợt vòng N). Cần thêm màn hình, hoặc đổi kích thước viewport: nói với Claude, rồi mở `features/<f>/feature.json` để xem lại.
2. Đưa use case. Kéo file `.md` hoặc `.docx` vào chat, nói tính năng nào. Claude chuyển file Word sang `.md` cùng tên, tách ảnh vào `<tên>.images/`, giữ file gốc. Mở file `.md` xem lại bảng và ảnh trước khi sinh test case. File `.doc` cũ: mở bằng Word, lưu lại dạng `.docx`. Sửa use case thì sửa file Word, đổi tên rồi kéo vào chat lại, vì tool không ghi đè file có sẵn.
3. Đăng nhập tay nếu trang cần (xem mục 6).
4. Export Figma nếu có (xem mục 7).
5. Mỗi lần test là một đợt, thư mục `evidence/<ngày>_<tính năng>/`. Claude tạo đợt khi cần. Bạn không phải làm gì.

### Giai đoạn 2. Sinh và duyệt test case (điểm duyệt 1)

1. Nói: "Sinh test case cho tính năng X". Claude ghi test case mới ở trạng thái `draft`.
2. Mở `features/<f>/testcases.json` và đọc từng test case. Cần sửa thì nói Claude sửa chỗ nào, hoặc tự sửa trong file.
3. Đúng thì nói "duyệt TC_X" hoặc "duyệt hết". Sai thì để `draft`.

AI chỉ chạy test case đã `reviewed`.

### Giai đoạn 3. AI chạy thử và xác nhận (điểm duyệt 2)

1. Nói: "Chạy thử TC_X". Claude mở trình duyệt, làm từng bước, chụp ảnh. Nhiều test case thì Claude làm lần lượt.
2. Claude báo kết quả AI đề xuất và đường dẫn `<đợt>/ai-run/<id>.md`. Mở file đọc. Xem ảnh từng bước trong `<đợt>/screenshots/<id>/`.
3. Đồng ý thì nói "xác nhận TC_X". Không đồng ý thì nói "từ chối TC_X, lý do ...". Nghi có bug thì nói "nghi bug ..." kèm mô tả, Claude ghi vào `<đợt>/bugs.md`.

Gặp OTP hay captcha, AI dừng và ghi "CẦN TESTER ĐĂNG NHẬP LẠI". Đăng nhập lại theo mục 6 rồi nói "chạy thử lại TC_X".

### Giai đoạn 4. Chuyển sang Playwright

1. Nói: "Chuyển TC_X sang Playwright". Claude chỉ chuyển test case bạn đã xác nhận. Claude tạo `tests/<f>/<id>.spec.ts` và chạy thử.
2. Claude báo spec pass hay fail. Mở spec nếu muốn đọc.
3. Spec pass và bạn đồng ý thì nói "đưa TC_X vào regression". Spec fail thì xem mục 9.

### Giai đoạn 5. So UI với Figma

1. Kéo ảnh Figma (mục 7) vào chat, nói screen nào. Claude chụp trang thật và so với ảnh. Nhiều screen thì nói rõ từng screen.
2. Claude nhờ skill đọc ảnh và ghi `<đợt>/ui-diff/<screen>/report.md`. Claude liệt kê trong chat từng dòng "Sai khác đề xuất" kèm số mục.
3. Trả lời từng mục là bug, chấp nhận hay cần xem. Ví dụ: "mục 1 chấp nhận, mục 2 bug lệch 8px, mục 3 cần xem". Đối chiếu ảnh trong `crops/` và `side_by_side.png` trước khi quyết.
4. Khi UI khớp thiết kế, nói "tạo baseline <screen>". Cần có spec chứa `toHaveScreenshot('<screen>.png')` trong `tests/<f>/`, nhờ Claude viết nếu chưa có. Còn mục nào là "bug" thì baseline bị chặn. Báo bug, chờ sửa, rồi nói Claude chụp và so lại. Nếu đánh nhầm, đổi quyết định bằng cách trả lời lại số mục đó.

### Giai đoạn 6. Regression và tổng kết

1. Nói: "Chạy regression cho tính năng X". Claude chạy mọi spec của tính năng. Chạy hai lần liên tiếp, cả hai phải pass. Claude báo từng lần.
2. Nói: "Tạo tổng kết đợt". Claude sinh lại `<đợt>/summary.md` từ dữ liệu của đợt.
3. Nói kết luận bằng lời của bạn: "kết luận đợt: ...". Cho biết tên: "tôi là <tên>". Claude chép đúng lời bạn vào mục "Kết luận của tester". Claude không tự viết mục này.

## 6. Đăng nhập tay

AI không được vượt SSO, OTP, captcha. Bạn đăng nhập, tool lưu phiên.

1. Nói: "Đăng nhập tính năng X". Một cửa sổ Chromium hiện ra trên máy bạn.
2. Đăng nhập trên cửa sổ đó như bình thường (tên, mật khẩu, OTP). Chờ vào đến trang chính.
3. Trả lời "xong" trong chat. Claude lưu phiên ở `auth/<f>.json`, cửa sổ tự đóng, rồi kiểm tra phiên dùng được.

Không gõ mật khẩu hay OTP vào chat. Lỡ gõ thì đổi mật khẩu. Claude sẽ không dùng và không lặp lại giá trị đó.

Đăng nhập lại khi:

- Spec hoặc AI bị đẩy về trang đăng nhập.
- AI báo "CẦN TESTER ĐĂNG NHẬP LẠI".
- Claude báo kiểm tra phiên không đạt.
- Bạn đã đổi tài khoản hoặc môi trường.

Mỗi tính năng một phiên riêng. Không dùng chung giữa các tính năng.

## 7. Export Figma

Làm một lần cho mỗi screen.

- Export frame ở tỉ lệ 1x, định dạng PNG.
- Chiều rộng ảnh bằng đúng chiều rộng viewport của tính năng.
- Kéo ảnh vào chat và nói đó là screen nào. Claude chép vào `features/<f>/figma/<screen>.png`. Tên file là tên screen trong `feature.json`.
- Frame dài hơn viewport thì nói: "chụp cả trang".
- Export 2x thì nói Claude đặt `scale: 2` cho screen đó. Nên dùng 1x.
- Ghi link frame và ngày export vào `features/<f>/figma/README.md` (bạn tự tạo, tool không đọc).

Thiếu ảnh cho screen nào thì Claude báo và hỏi bạn. Claude không bỏ qua âm thầm.

## 8. Cách đọc kết quả

| File | Là gì | Cách đọc |
| --- | --- | --- |
| `<đợt>/ai-run/<id>.md` | Báo cáo AI chạy thử | Đầu file có kết quả AI đề xuất (ĐẠT, KHÔNG ĐẠT, KHÔNG XÁC ĐỊNH). Bảng bên dưới: từng kết quả mong đợi, AI thấy gì, ảnh. Xem mục "Ghi chú cho tester" trước. Ảnh là bằng chứng, đối chiếu với kết luận |
| `<đợt>/ui-diff/<screen>/report.md` | Sai khác UI AI đề xuất | Mỗi dòng có mức (Cao, Trung bình, Thấp) và phân loại. Mức Cao ảnh hưởng chức năng hoặc nhận diện. "Có thể chấp nhận" như dữ liệu mẫu khác nhau. Bạn quyết định từng dòng qua chat |
| `<đợt>/summary.md` | Tổng kết đợt | Bảng test case, bảng sai khác UI, vấn đề kỹ thuật. "Kết luận của tester" ghi theo lời bạn |
| `<đợt>/playwright-log.txt` | Log lần chạy gần nhất | Tìm dòng bắt đầu bằng `Error:` và dòng có dấu `>`. Hoặc nhờ Claude tóm tắt lỗi |
| `<đợt>/bugs.md` | Bug bạn nghi ngờ | Mỗi test case một mục |

`<đợt>/playwright-report/` và `<đợt>/test-results/` có thể chứa giá trị đã nhập (xem mục 3). Đừng mở chúng bằng Claude. Cần xem trace của test fail thì nhờ dev, đừng dán nội dung vào chat.

Pixel diff chỉ khoanh vùng khác nhau. Nó không nói UI đạt hay không. Vùng đỏ có thể chỉ là dữ liệu động.

## 9. Khi spec fail

Phân loại trước, rồi mới làm gì. Claude sẽ nhắc bạn phân loại.

| Loại | Dấu hiệu | Việc làm |
| --- | --- | --- |
| Bug thật | Chức năng sai. Ảnh lúc chạy cho thấy lỗi thật | Nói "nghi bug ..." để ghi vào `bugs.md`, báo dev. Không sửa spec |
| Locator hỏng | Lỗi "không tìm thấy element" mà chức năng vẫn chạy bình thường. Nút đổi tên, đổi nhãn | Nói: "Sửa locator TC_X". Claude đề xuất bản sửa |
| UI đổi có chủ đích | Luồng hoặc màn hình khác thiết kế cũ | Cập nhật test case và use case, rồi nói Claude chạy thử và chuyển Playwright lại |

Với locator hỏng:

1. Claude mở trang, tìm element tương đương, ghi `<đợt>/heal/<id>.diff` và `<id>.md`. Claude hiện diff và lý do trong chat.
2. Đọc diff (dòng `-` bị xóa, dòng `+` được thêm) và lý do.
3. Chấp nhận thì nói "áp dụng sửa locator TC_X". Claude lưu bản cũ ở `<đợt>/heal/<id>.spec.ts.bak`, sửa spec, chạy lại.
4. Spec vẫn fail ở dòng khác thì nói Claude đề xuất lại. Muốn quay về bản cũ thì nhờ Claude chép `.bak` đè lên `tests/<f>/<id>.spec.ts`.

Tool từ chối áp dụng nếu diff đụng vào `expect(`, bỏ một bước, hoặc đổi dòng không phải locator. Khi đó đừng ép. Phân loại lại: nhiều khả năng là bug thật hoặc UI đổi.

AI không bao giờ sửa kết quả mong đợi để ép test pass.

## 10. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| Spec chạy ra trang đăng nhập | Phiên hết hạn. Đăng nhập lại (mục 6) |
| Claude báo "CẦN TESTER ĐĂNG NHẬP LẠI" | Đăng nhập lại (mục 6), rồi nói chạy lại test case |
| Claude từ chối đưa vào regression | Spec chưa pass ở lần chạy gần nhất. Nhờ Claude chạy lại spec, hoặc xem mục 9 |
| Claude từ chối tạo baseline | Còn mục chưa quyết định, còn mục "bug", hoặc thiếu spec `toHaveScreenshot`. Đọc thông báo Claude đưa ra và làm theo |
| Không thấy skill của project trong Claude Code | Mở Claude Code ở đúng thư mục project |
| Thiếu ảnh Figma | Claude báo cảnh báo ở screen đó. Export và kéo ảnh vào chat (mục 7) |
| Muốn thấy trình duyệt khi AI làm việc | Nói "Mở trình duyệt khi chạy". Muốn ẩn lại: "Chạy ẩn trình duyệt" |
