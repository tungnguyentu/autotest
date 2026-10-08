---
name: gen-testcases
description: Sinh test case từ use case cho một tính năng. Đọc features/<feature>/usecases/*.md và feature.json, ghi features/<feature>/testcases.json theo schema với status draft, phủ positive, negative, boundary, validation, có dữ liệu test cụ thể. Dùng khi người dùng gõ /gen-testcases <feature>, hoặc nhờ "sinh test case", "viết test case từ use case", "tạo testcases.json", "bổ sung test case cho tính năng".
---

# gen-testcases: use case thành test case

Lệnh: `/gen-testcases <feature>`. Đầu ra là ĐỀ XUẤT ở trạng thái `draft`. Tester đọc và duyệt trong chat. Chỉ khi tester nói "duyệt <mã>" hoặc "duyệt hết" mới chạy `npm run cli -- testcase-status --feature <feature> --id <mã> --status reviewed` (hoặc `--all-draft`).

## Đọc trước khi làm

1. `CLAUDE.md` và `docs/schemas.md` (mục `testcases.json`).
2. `features/<feature>/feature.json`: `service`, `baseURL`, các key trong `screens`.
3. Mọi file `features/<feature>/usecases/*.md`. Không có file nào thì nhờ tester gửi file use case (.md hoặc .docx, ví dụ tài liệu D5) hoặc đường dẫn file, rồi thêm bằng `npm run cli -- usecase-add --feature <feature> --file <đường dẫn>`.
   File .md có dòng đầu `<!-- Tool chuyển tự động từ <tên>.docx ... -->` là bản chuyển từ Word. Ảnh nằm ở `usecases/<tên>.images/` (link trong file đã mã hóa dấu cách và dấu tiếng Việt). Mở từng ảnh bằng công cụ đọc ảnh khi use case dựa vào ảnh, ví dụ màn hình mẫu hay sơ đồ luồng. Bảng có ô gộp giữ dạng HTML `<table>`. Không đọc file `.docx`, chỉ đọc file `.md`.
4. `features/<feature>/testcases.json` nếu đã có.

Không đọc `features/*/.env` và `auth/`.

## Quy trình

### 1. Lập danh sách điều kiện cần phủ

Với mỗi use case, liệt kê: luồng chính, luồng thay thế, ràng buộc dữ liệu từng trường, quy tắc nghiệp vụ, thông báo lỗi nêu trong tài liệu. Mỗi mục thành ít nhất một test case. Dưới đây là các nhóm phải có nếu use case cho phép:

| `type` | Phủ cái gì |
| --- | --- |
| `positive` | Luồng đúng với dữ liệu hợp lệ, từng nhánh thay thế hợp lệ |
| `negative` | Sai thông tin, thiếu quyền, thao tác sai thứ tự, dữ liệu không tồn tại |
| `boundary` | Giá trị biên: rỗng, 1 ký tự, đúng giới hạn, vượt giới hạn 1 đơn vị, số âm, số 0 |
| `validation` | Thông báo lỗi từng trường: bắt buộc, định dạng, độ dài, ký tự đặc biệt |

Use case không nêu một nhóm thì không bịa. Ghi nhóm bị thiếu và lý do vào câu trả lời cho tester.

### 2. Viết test case

Mỗi test case đủ các trường theo schema:

- `id`: `TC_<FEATURE_VIẾT_HOA>_<NNN>`, NNN 3 chữ số, tiếp số lớn nhất đang có (không dùng lại id cũ). Tên feature có dấu `-` thì đổi thành `_`.
- `title`: một câu nói rõ điều kiện và kết quả, ví dụ "Đăng nhập thất bại khi mật khẩu sai".
- `screen`: key trong `feature.json` nếu test case kiểm tra màn hình đó. Không có key phù hợp thì bỏ trường.
- `preconditions`: trạng thái cần có trước (đã đăng nhập, dữ liệu đã tồn tại). Mảng rỗng nếu không có.
- `steps`: từng thao tác một dòng, theo thứ tự thực tế trên giao diện trang, kèm dữ liệu test cụ thể. Viết "Nhập `ab` vào ô Tên" chứ không viết "Nhập tên ngắn".
- `expected`: mỗi dòng là một điều quan sát được và kiểm tra được (URL, chữ hiển thị, phần tử hiện hoặc ẩn, thông báo lỗi đúng nguyên văn trong use case). Mỗi dòng sẽ thành ít nhất một `expect()`. Không viết "hoạt động đúng".
- `priority`: `High` cho luồng chính và lỗi chặn nghiệp vụ, `Medium`, `Low` cho trường hợp hiếm.
- `type`: một trong bốn giá trị ở bảng trên.
- `status`: luôn `draft`.

Dữ liệu test:

- Cụ thể và lặp lại được: email `qa.tester01@example.com`, chuỗi 256 ký tự thì ghi rõ "256 ký tự `a`".
- Không bịa tài khoản thật. Cần tài khoản hợp lệ thì viết `<secret:USER_EMAIL>` và `<secret:USER_PASSWORD>` ở bước nhập, và ghi vào `tester_note`: "Cần khóa USER_EMAIL, USER_PASSWORD trong features/<feature>/.env". Không đoán giá trị.
- Dữ liệu dùng chung nhiều test case thì nhắc lại trong từng test case, không tham chiếu chéo.

Bước cần OTP, captcha, hoặc việc ngoài trình duyệt (đọc email, SMS): đặt `"manual": true` cho cả test case và ghi lý do vào `tester_note`. AI không chạy test case manual. Vẫn viết đủ steps và expected để tester làm tay.

### 3. Ghi file, không ghi đè công việc của tester

- Đọc `testcases.json` hiện có. Giữ nguyên từng phần tử cũ, cùng thứ tự, kể cả `draft`. Chỉ thêm phần tử với id mới ở cuối.
- Không sửa, không xóa, không đổi `status` của test case đã có. Test case đã `reviewed` trở lên là của tester.
- Điều kiện nào đã có test case tương đương thì bỏ qua và nói rõ ở câu trả lời. Muốn đổi test case cũ thì hỏi tester. Tester đồng ý thì sửa nội dung trong `testcases.json`, giữ nguyên `id` và `status`.
- Ghi bằng công cụ ghi file, một mảng JSON, thụt 2 dấu cách, UTF-8.

### 4. Kiểm tra

```bash
npm run cli -- validate-testcases --feature <feature>
```

Lệnh đọc file theo `tool/core/schemas.ts`, in số test case theo loại và status, và cảnh báo (screen không có trong `feature.json`, nhắc OTP hoặc captcha mà chưa `manual`). Sai schema thì sửa phần mình thêm rồi chạy lại. Cảnh báo thì xử lý hoặc nêu cho tester.

### 5. Trả lời ngắn

- Số test case mới theo `type`, số test case `manual`, id đã thêm.
- Điều kiện use case chưa rõ, giả định đã dùng (tester cần xác nhận).
- Các khóa `.env` cần có.
- Liệt kê ngắn từng test case mới (mã, tiêu đề, loại) để tester đọc trong chat.
- Bước tiếp: tester nói "duyệt <mã>", "duyệt hết", hoặc nêu chỗ cần sửa. Sau khi duyệt, AI chạy thử (skill `run-testcase`).

## Không được làm

- Ghi `status` khác `draft`.
- Ghi đè, sửa, xóa test case đã có.
- Bịa quy tắc nghiệp vụ, thông báo lỗi, hoặc giá trị biên mà use case không nói. Chỗ không chắc thì đặt `tester_note` để hỏi tester.
- Ghi credential thật vào bất cứ đâu, đọc `.env` hay `auth/`.
- Chạy trình duyệt. Skill này chỉ đọc tài liệu và ghi `testcases.json`.
