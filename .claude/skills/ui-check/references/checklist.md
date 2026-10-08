# Checklist đối chiếu UI

Dùng khi xem `side_by_side.png` và `crops/region_NN.png`. Mỗi mục: cái cần nhìn, và nhiễu thường gặp để không báo nhầm.

Nguyên tắc chung: ảnh Figma là thiết kế, ảnh thực tế là bản dựng. Lệch nhỏ hơn 1 đến 2px ở mép chữ hoặc mép bo góc thường là khử răng cưa, không báo. Số đo từ ảnh luôn là "ước lượng". Chỉ tọa độ và kích thước vùng trong `metrics.json` là số đã đo.

## 1. Layout

- Vị trí và thứ tự các khối, căn lề trái hoặc phải, căn giữa.
- Khoảng cách giữa các khối (trên, dưới, giữa các cột), độ rộng cột.
- Nhiễu: nội dung động làm trang cao hơn Figma thì các khối bên dưới trượt xuống, mọi vùng bên dưới đều đỏ. Báo một dòng ở chỗ bắt đầu lệch, ghi rõ "các vùng bên dưới lệch theo", không liệt kê từng vùng.

## 2. Kích thước

- Rộng và cao của nút, ô nhập, thẻ, ảnh, icon.
- Độ dày viền, bán kính bo góc nếu nhìn rõ.
- Nhiễu: chênh 1px do làm tròn sub-pixel.

## 3. Màu

- Nền, chữ, viền, trạng thái (hover, disabled, lỗi) nếu ảnh có.
- Chỉ nêu màu khi phân biệt được bằng mắt (đậm hơn, nhạt hơn, khác sắc). Không ghi mã hex nếu không chắc.
- Nhiễu: ảnh Figma export có profile màu khác, cả ảnh lệch đều một chút. Báo một dòng "toàn ảnh lệch tông", Cần tester xác nhận.

## 4. Typography

- Cỡ chữ, độ đậm, khoảng cách dòng, họ font (serif hay sans), hoa thường, căn lề.
- Nhiễu: cùng font nhưng khác engine hiển thị cho ra nét chữ và độ rộng khác nhau vài px. Chỉ báo khi khác họ font, cỡ, độ đậm hoặc xuống dòng khác.

## 5. Nội dung

- Chữ sai hoặc thiếu, chính tả, dấu tiếng Việt, nhãn nút, placeholder.
- Dữ liệu mẫu trong Figma ("Nguyễn Văn A", số liệu giả) khác dữ liệu thật: Có thể chấp nhận.
- Vùng động (giờ, avatar, số liệu) nằm trong `mask_boxes` đã bị loại khỏi diff. Đừng báo lại chúng trừ khi lệch về layout.

## 6. Icon và hình ảnh

- Thiếu, sai hình, sai kích thước, lệch vị trí, độ mờ.
- Ảnh minh họa hay ảnh người dùng khác dữ liệu mẫu: Có thể chấp nhận.

## 7. Thành phần thiếu hoặc thừa

- Khối, nút, đường kẻ, badge có trong Figma mà thực tế không có, hoặc ngược lại.
- Banner, popup, cookie notice chỉ có ở môi trường test: ghi rõ, Cần tester xác nhận.

## Chọn mức

| Mức | Khi nào |
| --- | --- |
| Cao | Ảnh hưởng chức năng (nút bị che, thiếu trường), sai nhận diện (logo, màu thương hiệu), thiếu hoặc thừa cả khối |
| Trung bình | Nhìn thấy ngay khi đặt cạnh nhau: lệch khoảng cách, sai cỡ chữ, sai màu rõ |
| Thấp | Vài px, khó thấy nếu không đặt cạnh nhau |

## Chọn phân loại

| Phân loại | Khi nào |
| --- | --- |
| Sai khác thật | Bản dựng khác thiết kế và không giải thích được bằng dữ liệu hay engine hiển thị |
| Có thể chấp nhận | Do dữ liệu thật khác dữ liệu mẫu, font rendering, vùng động |
| Cần tester xác nhận | Không chắc, hoặc cần biết ý đồ thiết kế (ví dụ responsive, trạng thái ẩn) |

Khi phân vân giữa Sai khác thật và Cần tester xác nhận, chọn Cần tester xác nhận và nói rõ vì sao chưa chắc.
