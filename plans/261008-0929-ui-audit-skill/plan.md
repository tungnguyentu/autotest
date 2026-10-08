---
title: "Skill /ui-audit: kiểm tra giao diện không cần Figma, chạy bằng chat"
status: completed
priority: P1
created: 2026-10-08
---

# Skill /ui-audit

## Mục tiêu

Tester tải repo về, chạy `npm install`, mở Claude Code và gõ `/ui-audit <url hoặc feature>`. Claude tự kiểm tra trang ở theme sáng và tối, desktop và mobile, theo bộ quy chuẩn do AI đặt. Đầu ra là report đề xuất để tester duyệt. Không cần Figma, không cần use case.

## Ràng buộc

- Tạm dừng phần UI. Không sửa `tool/ui/` và `tool/api/`.
- Phần máy làm (chụp, đo, ghép ảnh) nằm trong lệnh CLI `audit`, chạy lặp lại được. Phần đánh giá bằng mắt và viết report do skill làm.
- Credential và phiên: giữ nguyên quy tắc của `CLAUDE.md`.
- Kết quả là ĐỀ XUẤT. Tester quyết định.

## Ngoài phạm vi

- Hiển thị kết quả audit trên UI.
- Kiểm tra trên Safari, Firefox. Đo tốc độ tải trang.

## Thay đổi

| File | Việc |
| --- | --- |
| `tool/core/schemas.ts` | Thêm trường tùy chọn `theme` vào feature.json |
| `tool/cli/feature-init.ts`, `tool/cli.ts` | Lệnh `feature-init`: tạo feature.json từ URL, không cần UI |
| `tool/cli/audit.ts`, `tool/core/audit-checks.ts`, `tool/core/png-tools.ts` | Lệnh `audit`: chụp theo theme và viewport, đo, ghép ảnh sáng và tối để xem |
| `.claude/skills/ui-audit/` | Skill và bộ quy chuẩn mặc định |
| `CLAUDE.md`, `docs/` | Quy trình chat, schema mới |
| Test | Schema `theme`, ghép ảnh, `audit` trên trang HTML cục bộ |

## Tiêu chí nghiệm thu

Đã đạt cả năm tiêu chí (2026-10-08). Bằng chứng ghi sau mỗi dòng.

1. [x] `npm run cli -- feature-init --feature x --url https://...` tạo feature.json hợp lệ. Test `feature-init` trong `tool/cli/__tests__/audit.test.ts`.
2. [x] `npm run cli -- audit --feature x` tạo `<đợt>/ui-audit/<screen>/` với ảnh toàn trang đủ chiều cao (kể cả trang cao hơn 16384px), ảnh ghép sáng và tối, `checks.json`. Ảnh mobile của bizfly cao 22667px, ghép đủ.
3. [x] Test tự động xanh, typecheck sạch. 185 test pass.
4. [x] Chạy thật trên https://staging-home.bizflycloud.vn cho ra các lỗi đã thấy ở lần audit tay (tương phản nhãn báo trong dark, thiếu H1, `rel` sai, link không có `href`). Đợt `2026-10-08_bizfly-home_r2` và `_r3`.
5. [x] Skill hướng dẫn Claude viết `report.md` đúng mẫu, mục quyết định của tester để trống. Chạy skill thật: `evidence/2026-10-08_bizfly-home_r3/ui-audit/home/report.md`, có `probe/01.png`.
