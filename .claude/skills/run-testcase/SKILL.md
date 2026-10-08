---
name: run-testcase
description: AI chạy thử một test case đã duyệt trên web bằng agent-browser, ghi từng step kèm thuộc tính element, ảnh từng step, kết quả đề xuất cho tester. Dùng khi người dùng gõ /run-testcase <feature> <id>, hoặc nhờ "chạy thử test case", "cho AI chạy TC_...", "chạy test case trên staging", "ghi step để chuyển Playwright".
---

# run-testcase: AI chạy thử một test case

Lệnh: `/run-testcase <feature> <id>`. Kết quả là ĐỀ XUẤT. Tester quyết định cuối cùng. Không tự kết luận đạt hay không đạt cuối cùng, không đổi `status` của test case, không đổi sang `automated`.

Công thức dưới đây dùng `F` cho tên tính năng, `ID` cho mã test case, `S` cho session `ui-check-F`. Lệnh trình duyệt: `agent-browser --session S ...`. Cách dùng chi tiết: `references/agent-browser-recipes.md`. Mẫu báo cáo: `.claude/skills/_shared/report-template.md`.

## Quy tắc về credential (bắt buộc)

- Không đọc, không in `features/F/.env` và `auth/`. Không `cat`, `grep`, `eval` để lấy giá trị mật khẩu, cookie, token.
- Điền credential chỉ bằng `npm run cli -- fill-secret`. Bạn chỉ biết tên khóa (ví dụ `USER_PASSWORD`), không bao giờ thấy giá trị.
- Không tự chạy `fill` hay `type` của agent-browser cho dữ liệu nhạy cảm, không `state save`, không `get value` trên ô mật khẩu.

## Quy trình

### 1. Đọc và kiểm tra

Đọc `features/F/feature.json` và test case `ID` trong `features/F/testcases.json`. Dừng và báo tester nếu: không có test case, `status` khác `reviewed`, hoặc `manual: true`. Không dùng `--force` khi chưa có đồng ý rõ của tester.

### 2. Mở lượt chạy

```bash
npm run cli -- run-start --feature F --id ID
```

Lệnh in thư mục đợt, tên session, baseURL, viewport và đường dẫn phiên đăng nhập (nếu có). Nó cũng đóng trình duyệt cũ của session này, nên mở trình duyệt SAU lệnh này, không trước:

```bash
agent-browser --session S [--state auth/F.json] open about:blank
agent-browser --session S set viewport <w> <h>
```

Thêm `--state auth/F.json` chỉ khi `run-start` báo có phiên. Tính năng có screen cần đăng nhập mà chưa có phiên: dừng, nhờ tester chạy `npm run cli -- login --feature F`.

### 3. Thực hiện từng bước của test case

Với mỗi bước trong `steps`:

1. Xem trang: `agent-browser --session S snapshot -i`. Chọn `@ref` đúng phần tử theo vai trò và tên.
2. Làm bước đó bằng `record-step`. Lệnh này tự làm thao tác trong trình duyệt, tra role và name của ref, ghi URL trước và sau, chụp ảnh, ghi step vào `ai-run/ID.json` rồi in lại step đã ghi:

```bash
npm run cli -- record-step --feature F --id ID --action navigate --value /login
npm run cli -- record-step --feature F --id ID --action fill --ref e3 --value "qa.tester01@example.com"
npm run cli -- record-step --feature F --id ID --action click --ref e5 --note "bấm Đăng nhập"
npm run cli -- fill-secret --feature F --id ID --ref e4 --key USER_PASSWORD
```

Không tự chạy `agent-browser click/fill/open` cho các bước của test case: thao tác không qua `record-step` sẽ không có trong history và Playwright sẽ thiếu bước đó.

`--action` gồm `navigate`, `click`, `fill`, `press`, `select`, `check`, `assert_text`, `assert_url`. Tùy chọn: `--note`, `--wait-url "**/dashboard"`, `--wait-text "Chào"`, `--no-settle`. Không có ref (ví dụ phần tử tìm bằng `find`) thì dùng `--target-json '{"role":"button","name":"Gửi"}'`. Giá trị bắt đầu bằng dấu `-` viết `--value=-abc`.

Sau mỗi step, đọc step được in lại: `target.role` và `target.name` phải có với step có element. Thiếu thì snapshot lại và chọn ref đúng, đừng đoán.

Lỗi `Không thấy @eN`: trang đã đổi, snapshot lại rồi chọn ref mới. Một thao tác lỗi hai lần thì dừng, ghi vào quan sát, đừng thử cách khác ngoài test case và đừng sửa dữ liệu trên hệ thống.

Chờ: ưu tiên `--wait-url`, `--wait-text`. `record-step` đã tự chờ network idle sau click, press, select.

### 4. Kiểm tra từng kết quả mong đợi

Sau khi xong các bước liên quan, kiểm tra từng dòng trong `expected` rồi ghi lại bằng step kiểm tra:

```bash
npm run cli -- record-step --feature F --id ID --action assert_url --value "**/dashboard"
npm run cli -- record-step --feature F --id ID --action assert_text --ref e7 --value "Xin chào"
npm run cli -- record-step --feature F --id ID --action assert_text --value "Mật khẩu không đúng"
```

Lệnh in `Kiểm tra: khớp` hoặc `KHÔNG khớp` kèm nội dung thực tế. `assert_text` không có `--ref` tìm trong cả trang.

Điều không kiểm được bằng hai action trên (phần tử ẩn, trạng thái nút, số lượng): đọc bằng `agent-browser --session S is visible @ref`, `is enabled @ref`, `get count "<css>"`, và ghi kết quả vào quan sát của `ai_result`. Xem ảnh `screenshots/ID/NN.png` bằng công cụ xem ảnh khi cần đánh giá bố cục.

Mỗi `expected` cần một đánh giá riêng: `ĐẠT`, `KHÔNG ĐẠT` hoặc `KHÔNG XÁC ĐỊNH`, kèm quan sát cụ thể (URL cuối, chữ thấy trên màn hình). Không bịa quan sát.

### 5. Gặp đăng nhập, OTP, captcha thì dừng

Nếu snapshot hoặc URL cho thấy trang đăng nhập, SSO, ô OTP hoặc captcha khi test case không yêu cầu đó (phiên hết hạn, bị chuyển hướng): dừng ngay, không điền, không vượt. Viết file kết quả với `verdict` `KHÔNG XÁC ĐỊNH` và lý do "CẦN TESTER ĐĂNG NHẬP LẠI", rồi sang bước 6. Nhắc tester chạy `npm run cli -- login --feature F`.

### 6. Kết thúc

Ghi file kết quả tạm vào thư mục đợt (`RUN` là thư mục đợt mà `run-start` đã in). `run-finish` chỉ nhận file nằm trong thư mục đợt hoặc trong project, và từ chối `.env` và `auth/`. Đuôi `.tmp` để UI bỏ qua file này:

```bash
RESULT="RUN/ai-result-ID.tmp"
cat > "$RESULT" <<'JSON'
{
  "verdict": "ĐẠT",
  "per_expected": [
    { "expected": "<nguyên văn dòng expected>", "verdict": "ĐẠT", "observation": "URL cuối: /dashboard" }
  ]
}
JSON
npm run cli -- run-finish --feature F --id ID --result-file "$RESULT"
rm -f "$RESULT"
```

`per_expected` có đúng một phần tử cho mỗi dòng `expected`, cùng thứ tự. `verdict` tổng là `ĐẠT` khi mọi dòng đạt, `KHÔNG ĐẠT` khi có dòng không đạt, `KHÔNG XÁC ĐỊNH` khi không kết luận được. `run-finish` ghi `ai_result` và đóng trình duyệt. Chạy dừng giữa chừng (bước 5, hoặc lỗi không qua được) cũng phải gọi `run-finish` để đóng trình duyệt.

Rồi viết `<đợt>/ai-run/ID.md` theo mục "AI run" của `.claude/skills/_shared/report-template.md`: bảng expected với ảnh, danh sách step (đọc từ `ai-run/ID.json`, credential hiển thị dạng `<secret:KEY>`), ghi chú cho tester về chỗ bất thường và nghi ngờ bug. Để trống mục xác nhận của tester.

Trả lời ngắn: thư mục đợt, verdict đề xuất, các điểm bất thường. Bước tiếp: tester xem kết quả trên UI.

## Không được làm

- Đọc, in, ghi giá trị credential ở bất cứ đâu (lệnh, file, câu trả lời).
- Vượt SSO, OTP, captcha, hoặc đăng nhập thay tester.
- Chạy test case không `reviewed` hoặc `manual`.
- Ghi đè hay xóa evidence cũ, sửa `ai-run/*.json` bằng tay, sửa `testcases.json`.
- Kết luận cuối cùng thay tester, đổi `status` test case.
- Bỏ qua bước của test case hoặc làm thêm bước ngoài test case.
- Để trình duyệt chạy sau khi xong. Luôn gọi `run-finish`.
