# Quy chuẩn mặc định của ui-audit

AI dùng bộ này khi không có Figma và không có use case. Tester muốn đổi cho một tính năng thì chép file này sang `features/<feature>/ui-audit-standards.md` rồi sửa. Skill ưu tiên file của tính năng.

| # | Quy chuẩn | Nguồn kiểm tra | Mức gợi ý khi vi phạm |
| --- | --- | --- | --- |
| Q1 | Hai theme đều đủ nội dung. Theme tối không còn khối nền sáng, ảnh nền trắng, chữ hoặc logo tối trên nền tối | Ảnh `review/`, `light_blocks_in_dark` | Trung bình. Cao nếu mất chữ hoặc nút |
| Q2 | Tương phản chữ đạt WCAG AA: 4.5:1 chữ thường, 3:1 chữ từ 24px hoặc đậm từ 18.66px | `contrast.items`, ảnh cho chữ trên ảnh nền | Trung bình. Cao nếu là nút hoặc giá |
| Q3 | Không cuộn ngang, không phần tử tràn khỏi màn hình | `page.horizontal_scroll`, `overflow.items` | Trung bình |
| Q4 | Không ảnh hỏng. Ảnh có thuộc tính `alt` | `images.broken`, `images.missing_alt` | Trung bình (hỏng), Thấp (thiếu alt) |
| Q5 | Không lỗi JavaScript, không lỗi console, không request 4xx hoặc 5xx | `page_errors`, `console`, `failed_requests` | Cao nếu lỗi JS làm hỏng chức năng, còn lại Thấp |
| Q6 | Nút đổi theme đổi được, nhãn đổi theo, theme được nhớ sau khi tải lại | `theme_toggle` | Cao nếu không đổi được, Trung bình nếu không nhớ |
| Q7 | Link và nút có đích hoặc hành động, có tên đọc được, thuộc tính `rel` đúng cú pháp | `links.*`, bấm thử bằng agent-browser | Cao nếu link chức năng (form, đăng ký) không chạy |
| Q8 | Có đúng một H1. Tiêu đề không nhảy cấp | `headings` | Trung bình (thiếu H1), Thấp (nhảy cấp) |
| Q9 | Nút nổi, header dính không che chữ, số liên hệ, nút bấm | `floating`, ảnh `-top.png`, `-bottom.png` | Trung bình |
| Q10 | Bố cục mobile không vỡ: chữ không bị cắt, thẻ không chồng nhau, khoảng cách đều | Ảnh `review/mobile-*` | Trung bình |

Ghi chú: theme mặc định khi hệ điều hành chọn tối (`os_dark_preference`) là quyết định sản phẩm. Báo ở mức Thấp, phân loại "Cần tester xác nhận".
