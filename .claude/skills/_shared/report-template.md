# Mẫu báo cáo

Dùng chung cho các skill. Mọi báo cáo là ĐỀ XUẤT cho tester. Không viết câu kết luận thay tester.

## AI run: `<đợt>/ai-run/<id>.md`

Điền từ `ai-run/<id>.json` và test case. Ảnh dùng đường dẫn tương đối với thư mục đợt.

```markdown
# <ID> - <title>

- Tính năng: <feature> · Service: <service> · Ngày: <YYYY-MM-DD>
- Môi trường: <baseURL> · Viewport: <w>x<h>
- Kết quả AI đề xuất: ĐẠT | KHÔNG ĐẠT | KHÔNG XÁC ĐỊNH

| # | Kết quả mong đợi | AI đánh giá | Quan sát | Ảnh |
| --- | --- | --- | --- | --- |
| 1 | Chuyển tới /dashboard | ĐẠT | URL cuối: /dashboard | screenshots/<id>/05.png |

## Step đã thực hiện
1. navigate /login
2. fill "Email" ← <secret:USER_EMAIL>
3. click button "Đăng nhập"

## Ghi chú cho tester
- Bước bất thường, lỗi, chỗ AI không chắc chắn
- Nghi ngờ bug (tester quyết định có ghi bugs.md không)

## Xác nhận của tester
- [ ] Đồng ý kết quả · [ ] Không đồng ý - lý do:
```

## UI diff: `<đợt>/ui-diff/<screen>/report.md`

```markdown
# UI check - <screen>

- Tính năng: <feature> · Ngày chụp: <YYYY-MM-DD> · URL: <url>
- Ảnh Figma: features/<feature>/figma/<screen>.png (sửa đổi lần cuối: <ngày>)
- Viewport: <w>x<h> · diff_ratio: <số> · Số vùng khác: <n>
- Cảnh báo kỹ thuật: <từ metrics.json, hoặc "không">

![side by side](side_by_side.png)

## Sai khác đề xuất

| # | Vùng | Hạng mục | Figma | Thực tế | Mức | Phân loại |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | region_01 | Kích thước | Nút "Đăng nhập" cao ~48px | ~40px (ước lượng) | Trung bình | Sai khác thật |
| 2 | region_03 | Nội dung | "Quên mật khẩu?" | "Quên mật khẩu" | Thấp | Sai khác thật |
| 3 | region_05 | Nội dung | Tên mẫu "Nguyễn Văn A" | Tên tài khoản test | - | Có thể chấp nhận |

Mức: Cao (ảnh hưởng chức năng hoặc nhận diện) · Trung bình (thấy rõ) · Thấp (vài px)
Phân loại: Sai khác thật · Có thể chấp nhận · Cần tester xác nhận

## Đã kiểm tra, không thấy sai khác
- Layout tổng thể, màu nền, logo ...

## Quyết định của tester
- [ ] UI khớp thiết kế, cho phép tạo baseline
- [ ] Có bug UI (ghi bugs.md): #...
```

## Tổng kết đợt: `<đợt>/summary.md`

Do tool sinh (`summary.md` có frontmatter). Skill không tự viết mẫu này, chỉ để trống mục kết luận.

```markdown
# Đợt test <YYYY-MM-DD>_<feature>

## Test case (AI đề xuất)
| ID | Tiêu đề | AI đề xuất | Evidence |
| --- | --- | --- | --- |

## UI check (AI đề xuất)
| Screen | Số sai khác (Cao/TB/Thấp) | Báo cáo |
| --- | --- | --- |

## Vấn đề kỹ thuật
- Màn thiếu ảnh Figma, lỗi chụp, cảnh báo kích thước ...

## Kết luận của tester
<!-- để trống - tester điền -->
```
