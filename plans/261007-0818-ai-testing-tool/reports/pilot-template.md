# Báo cáo pilot: <tên tính năng>

Trạng thái: chưa điền. Tester hoặc phiên sau điền khi có use case từ D5 và tài khoản staging.

- Tính năng pilot: ______ (use case từ D5, ngày nhận: ______)
- Môi trường: ______ · Tester: ______ · Đợt: `evidence/<ngày>_<feature>/`
- Người thử làm theo `docs/tester-guide.md` chưa tham gia dự án: ______ (có / không)

## Năm số đo

Số này cũng ghi vào `summary.md` của đợt pilot.

| # | Số đo | Giá trị | Cách lấy |
| --- | --- | --- | --- |
| 1 | Số test case AI sinh ra | ___ | `npm run cli -- validate-testcases --feature <f>` ngay sau `/gen-testcases`, trước khi sửa |
| 2 | Số test case tester phải sửa tay (sửa nội dung, không tính chỉ đổi `draft` sang `reviewed`) | ___ | Đếm khi duyệt trên trang test case. Ghi ID và lý do ở bảng dưới |
| 3 | Số spec pass ngay lần chạy đầu | ___ / ___ | Khu Playwright, lần chạy đầu sau `/to-playwright`, trước khi sửa spec |
| 4 | Số locator xpath hoặc `// TODO locator` trong spec | ___ | `grep -rcE "xpath=|// TODO locator" tests/<f>/` |
| 5 | Số sai khác UI theo mức (Cao / Trung bình / Thấp) | ___ / ___ / ___ | Bảng "UI check" trong `summary.md`. Ghi cả số screen chưa so được |

## Vòng đầy đủ

Đánh dấu khi xong, kèm đường dẫn bằng chứng.

- [ ] Use case đã tải lên, test case `reviewed`
- [ ] AI chạy thử, tester xác nhận (`ai-run/<id>.json` có `tester.decision`)
- [ ] Spec pass, đã đưa vào regression
- [ ] So Figma, `report.md`, quyết định, baseline
- [ ] Regression pass hai lần liên tiếp trên máy tester (ghi hai tên đợt): ______ , ______
- [ ] Không có credential trong log, report, spec, `ai-run` (kiểm tra bằng `grep` với giá trị trong `.env`, không dán giá trị vào báo cáo này)

## Chỗ tester phải rời UI hoặc sửa tay

Mỗi dòng là một đầu vào cải tiến.

| # | Giai đoạn | Việc phải làm ngoài UI hoặc sửa tay | Vì sao | Đề xuất |
| --- | --- | --- | --- | --- |
| 1 | | | | |

## Test case phải sửa tay (số đo 2)

| ID | Sửa gì | Vì sao AI sai |
| --- | --- | --- |
| | | |

## Spec fail lần đầu và nguyên nhân (số đo 3)

| ID | Loại (bug thật, locator hỏng, UI đổi) | Xử lý | Có dùng `/heal-locator` không |
| --- | --- | --- | --- |
| | | | |

## Chỗ khó hiểu trong tài liệu

Người thử làm theo `docs/tester-guide.md` ghi lại chỗ vướng.

- 

## Kết luận và đề xuất cho module kế tiếp

- 
