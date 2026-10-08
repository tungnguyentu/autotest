# Mẫu report.md của ui-audit

```markdown
# UI audit - <feature> / <screen>

- URL: <url> · Ngày: <YYYY-MM-DD> · Đợt: <đường dẫn đợt>
- Không có Figma, không có use case. Quy chuẩn: <references/standards.md hoặc features/<f>/ui-audit-standards.md>
- Viewport: <danh sách> · Theme: <light, dark hoặc default> · Cách đổi theme: <method, key>
- Cảnh báo kỹ thuật: <từ checks.json, hoặc "không">

## Quy chuẩn

<chép bảng quy chuẩn đã dùng>

## Sai khác đề xuất

| # | Vùng | Quy chuẩn | Theme, viewport | Thực tế | Bằng chứng | Mức | Phân loại |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Khối "Báo chí" | Q2 | dark, desktop và mobile | Nhãn `cafef.vn` tỉ lệ 2.17:1, cần 4.5:1 | `checks.json` contrast, `review/desktop-04.png` | Trung bình | Sai khác thật |

Mức: Cao (ảnh hưởng chức năng) · Trung bình (thấy rõ) · Thấp (nhỏ hoặc phụ thuộc quyết định sản phẩm)
Phân loại: Sai khác thật · Có thể chấp nhận · Cần tester xác nhận

## Đã kiểm tra, không thấy lỗi

- <quy chuẩn và phạm vi đã đạt>

## Chưa kiểm tra

- <menu xổ, trạng thái hover, trình duyệt khác, ...>

## Quyết định của tester

- [ ] Đồng ý bộ quy chuẩn (gạch dòng bỏ):
- [ ] Bug cần báo dev (số dòng):
- [ ] Có thể chấp nhận (số dòng):
```
