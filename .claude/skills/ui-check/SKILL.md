---
name: ui-check
description: Đánh giá bằng mắt sự khác nhau giữa ảnh Figma và ảnh chụp thật của một screen, theo checklist bảy mục, rồi ghi report.md đề xuất cho tester. Dùng khi người dùng gõ /ui-check <feature> [screen], hoặc nhờ "so UI với Figma", "đọc ảnh diff", "đánh giá sai khác giao diện", "design QA", sau khi đã bấm "Chụp và so" trên UI của tool.
---

# ui-check: đọc ảnh so Figma và ghi report.md

Lệnh: `/ui-check <feature> [screen]`. Bỏ trống `screen` thì làm lần lượt mọi screen đã có `metrics.json` trong đợt mới nhất. Kết quả là ĐỀ XUẤT. Tester quyết định từng mục trên UI. Mẫu báo cáo: mục "UI diff" trong `.claude/skills/_shared/report-template.md`. Checklist chi tiết: `references/checklist.md`.

Skill này không chụp và không so ảnh. Việc đó do tool làm (nút "Chụp và so" trên trang đợt, hoặc `npm run cli -- capture` rồi `compare`). Pixel diff chỉ khoanh vùng, không phải tiêu chí đạt hay không đạt.

## Quy trình

### 1. Tìm đợt và kiểm tra đầu vào

```bash
ls -dt "${EVIDENCE_ROOT:-evidence}"/????-??-??_<feature>/ui-diff/<screen>/metrics.json "${EVIDENCE_ROOT:-evidence}"/????-??-??_<feature>_r[0-9]*/ui-diff/<screen>/metrics.json 2>/dev/null | head -1
```

Thư mục screen là thư mục chứa file đó. Dừng, không đoán, không tự chụp, nếu:

- Không có `metrics.json`: nói rõ chưa có kết quả so. Hướng dẫn tester mở trang đợt trên UI (http://localhost:4173), khu "So UI với Figma", tick screen, bấm "Chụp và so", rồi gõ lại lệnh. Nếu `meta.json` có cảnh báo (thiếu ảnh Figma, thiếu phiên đăng nhập, chuyển hướng), nêu đúng cảnh báo đó.
- `figma.png` hoặc `actual.png` không có trong thư mục: báo thiếu file nào.
- `metrics.json.warnings` có "Chiều rộng lệch": ảnh không cùng khung, mọi vùng diff có thể sai. Vẫn đọc ảnh nhưng ghi cảnh báo này ở đầu report và hạ mức tự tin của mọi dòng.

Đã có `report.md` trong thư mục screen: hỏi tester có muốn thay không. Đừng ghi đè khi chưa được đồng ý. Khi đã ghi đè thì để nguyên `decisions.json`: nó lưu mã băm của `report.md` lúc tester lưu, nên khi nội dung report đổi, tool coi quyết định cũ là hết hiệu lực, UI báo "report đã đổi, cần quyết định lại" và chưa cho tạo baseline. Đừng tự xóa hay sửa file này.

### 2. Đọc dữ liệu

Đọc `metrics.json` (kích thước, `diff_ratio`, `regions` đã xếp theo số pixel giảm dần, `warnings`) và `meta.json` (URL, `mask_boxes`, `figma_modified`, `warnings`). Đọc `features/<feature>/feature.json` để biết viewport, `mask` và `scale` của screen.

### 3. Xem ảnh

Dùng công cụ đọc ảnh (Read đọc được PNG) theo thứ tự:

1. `side_by_side.png`: ba cột là Figma, thực tế, diff (vùng khác tô đỏ, khung đỏ đánh số).
2. Từng `crops/region_NN.png` theo thứ tự trong `metrics.json`. Mỗi crop là Figma bên trái, thực tế bên phải.

Ảnh dài có thể bị thu nhỏ khi đọc. Chi tiết nhỏ (vài px, chữ nhỏ) thì dựa vào crop, đừng suy từ ảnh tổng.

### 4. Đối chiếu checklist và phân loại

Với mỗi vùng, và cả những chỗ không có khung đỏ nhưng thấy lệch, đối chiếu bảy mục: layout, kích thước, màu, typography, nội dung, icon hoặc hình ảnh, thành phần thiếu hoặc thừa. Cách nhận biết từng mục và nhiễu thường gặp: `references/checklist.md`.

Mỗi phát hiện có ba thuộc tính:

- Mức: Cao (ảnh hưởng chức năng hoặc nhận diện), Trung bình (thấy rõ), Thấp (vài px).
- Phân loại: Sai khác thật, Có thể chấp nhận (dữ liệu thật khác dữ liệu mẫu Figma, font rendering, vùng động), Cần tester xác nhận (không chắc).
- Hạng mục: một trong bảy mục trên.

Mô tả cụ thể, có số. Ví dụ "nút Đăng nhập cao khoảng 40px, Figma khoảng 48px (ước lượng)". Không bịa số đo: khi chỉ nhìn ảnh mà không đo được thì ghi "ước lượng", khi không đọc được thì ghi "không xác định được". Số đo chính xác chỉ lấy từ `metrics.json` (tọa độ và kích thước vùng, `changed_px`).

### 5. Ghi report.md

Ghi `<thư mục screen>/report.md` theo mẫu "UI diff" trong `_shared/report-template.md`, giữ nguyên tiêu đề mục. Quy tắc:

- Bảng "Sai khác đề xuất" có đúng bảy cột của mẫu: `#`, `Vùng`, `Hạng mục`, `Figma`, `Thực tế`, `Mức`, `Phân loại`. Tool đọc bảng này, nên không đổi tên cột, không thêm cột, không gộp dòng. Ký tự `|` trong ô viết thành `\|`.
- Mỗi dòng một sai khác. Cột `Vùng` ghi `region_NN` khi gắn với vùng của metrics, hoặc `ngoài vùng diff` khi thấy lệch ở chỗ không có khung.
- Mục "Đã kiểm tra, không thấy sai khác": liệt kê những mục checklist đã xem và không thấy lệch, để tester biết phạm vi đã kiểm.
- Mục "Quyết định của tester": để nguyên hai ô trống của mẫu. Không đánh dấu, không điền.
- Dòng "Cảnh báo kỹ thuật": chép `warnings` của `metrics.json`, hoặc "không".

Không có sai khác nào cũng vẫn ghi report với bảng chỉ có dòng tiêu đề và mục "Đã kiểm tra". Không viết "UI đúng thiết kế", "đạt", "pass" hay câu kết luận tương tự ở bất kỳ đâu.

### 6. Trả lời tester

Ngắn gọn: đường dẫn `report.md`, số sai khác theo mức (Cao, Trung bình, Thấp) và số mục chấp nhận hoặc cần xác nhận, cảnh báo kỹ thuật, screen bị bỏ qua và lý do. Nhắc tester mở trang đợt, chọn bug, chấp nhận hoặc cần xem cho từng dòng, bấm "Lưu quyết định". Chưa có tổng kết đợt thì nhắc bấm "Sinh lại từ dữ liệu của đợt" để `summary.md` cập nhật số sai khác. Không tự sửa `summary.md`.

## Không được làm

- Kết luận "UI đúng thiết kế", hay thay tester chọn bug, chấp nhận, cần xem.
- Chụp hay so lại ảnh, sửa `actual.png`, `figma.png`, `metrics.json`, `meta.json`, `decisions.json`, `baseline.json`.
- Chạy `--update-snapshots`, tạo hay sửa baseline, sửa `tests/__screenshots__/`.
- Dùng Figma MCP hay API. Chỉ dùng ảnh tester export.
- Đọc `features/*/.env` và `auth/`.
- Bịa số đo, màu hex, tên font mà ảnh không cho thấy rõ.
