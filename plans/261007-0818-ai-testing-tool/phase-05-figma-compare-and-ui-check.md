---
phase: 5
title: "Phase 5: So Figma và skill ui-check"
status: in-progress
priority: P1
effort: "2d"
dependencies: [2, 4]
---

# Phase 5: So Figma và skill ui-check

## Overview

Tool chụp màn hình theo `feature.json`, so với ảnh Figma tester export, tạo diff và crop. Skill `ui-check` trong Claude Code đọc ảnh theo checklist và ghi `report.md`. Tester đánh dấu từng mục trên UI và quyết định tạo baseline.

## Requirements

- [x] Lệnh `capture` và `compare` trong tool làm đúng việc của `capture.py` và `compare.py`: `actual.png`, `figma.png`, `meta.json` với mask box, `diff.png`, `side_by_side.png`, `crops/region_NN.png`, `metrics.json`. Cảnh báo khi kích thước lệch.
- [x] Trang đợt có khu "UI diff": chọn screen, nút "Chụp và so", hiện `side_by_side`, danh sách vùng với crop, cảnh báo thiếu ảnh Figma.
- [ ] Skill `/ui-check <feature> [screen]` đọc ảnh theo checklist bảy mục, ghi `report.md` theo mẫu, không kết luận thay tester.
- [x] Tester đánh dấu từng mục trong bảng sai khác (bug, chấp nhận, cần xem) và bấm "Cho tạo baseline". Tool chạy `npx playwright test --update-snapshots` cho spec của screen đó, ghi vào `tests/__screenshots__/<f>/`.

## Files to Create / Modify

- Create: `tool/cli/capture.ts` (Playwright: context với viewport, `device_scale_factor` 1, storageState khi `auth`, chờ `networkidle` và `document.fonts.ready`, tính mask box, chụp)
- Create: `tool/cli/compare.ts`. Dùng `pngjs` cộng `pixelmatch` với `threshold` tương đương `--threshold 20`. Resize ảnh Figma khi `scale` khác 1 bằng `sharp` hoặc downscale thủ công. Áp mask box. Gộp vùng theo lưới 16px như `find_regions`. Vẽ khung và số, side by side, crop.
- Create: `tool/core/ui-diff-store.ts` (đọc `metrics.json`, `report.md`, ghi quyết định tester vào `decisions.json`)
- Create: `tool/api/ui-diff.ts` (POST chụp và so, GET kết quả, POST quyết định, POST baseline)
- Create: `tool/ui/ui-diff-viewer.js`, Modify: `tool/ui/run.html`
- Create: `.claude/skills/ui-check/SKILL.md` (bước 6 và 7 của `SKILL.md` gốc: đánh giá bằng mắt và tổng kết), `references/checklist.md`
- Modify: `tool/core/playwright-runner.ts` (hỗ trợ cờ `--update-snapshots` cho một spec, chỉ gọi từ endpoint baseline)
- Create: `tool/cli/__tests__/compare.test.ts` (hai ảnh PNG sinh bằng code, vùng khác biết trước, kiểm tra `regions`, mask làm mất vùng)

## Implementation Steps

1. Viết `capture.ts` theo `capture.py`. Thêm cảnh báo chuyển hướng về trang login.
2. Viết `compare.ts` theo `compare.py`. So trên vùng chồng nhau, cảnh báo lệch chiều rộng trên 2px. Thuật toán gộp vùng chuyển trực tiếp từ `find_regions`.
3. Test `compare.ts` với ảnh sinh bằng `pngjs`.
4. Viết `ui-diff-store.ts`, `ui-diff.ts`. Endpoint chụp và so chạy tuần tự từng screen, trả kết quả qua SSE.
5. Viết `ui-diff-viewer.js`: ảnh `side_by_side` cuộn ngang, danh sách vùng kèm crop, bảng sai khác từ `report.md` nếu có. Thêm cột quyết định của tester. Nút "Cho tạo baseline" chỉ bật khi có spec cho screen và tester đã quyết định mọi mục.
6. Viết skill `ui-check`: đọc `metrics.json`, xem `side_by_side.png` rồi từng crop bằng công cụ đọc ảnh, ghi `report.md` theo mẫu, mô tả cụ thể, không bịa số đo. Phần "Quyết định của tester" để trống.
7. Endpoint baseline: chạy `--update-snapshots` cho `tests/<f>/<id>.spec.ts` có `toHaveScreenshot('<screen>.png')`, ghi `baseline.json` trong thư mục screen với ngày, ảnh Figma dùng, người duyệt.
8. Thêm quy ước `features/<f>/figma/README.md` vào `docs/` và vào khu UI diff (link frame, ngày export).

## Todo

- [x] `capture.ts`
- [x] `compare.ts` cộng test
- [x] Store và API ui-diff
- [x] `ui-diff-viewer.js`
- [x] Skill `ui-check` (đã tạo file; chưa chạy được trong Claude Code, chờ tester)
- [x] Endpoint baseline
- [x] Tài liệu quy ước Figma

## Verification

- Đặt `features/staging/figma/home.png` (ảnh Figma thật của màn hình staging, hoặc ảnh chụp rồi sửa vài chỗ bằng tay nếu chưa có Figma): "Chụp và so" tạo đủ file, `metrics.json` liệt kê đúng vùng đã sửa.
- Xóa ảnh Figma: UI báo thiếu, không bỏ qua âm thầm.
- (Chờ tester, agent không chạy được skill) `/ui-check staging home` trong Claude Code: `report.md` có bảng sai khác, mục quyết định trống.
- Đánh dấu mọi mục, bấm "Cho tạo baseline": `tests/__screenshots__/staging/home.png` xuất hiện, `baseline.json` ghi ngày.
- Chạy regression: `toHaveScreenshot` pass với baseline mới.
- `npm test` xanh.

## Success Criteria

Ba lớp kiểm tra UI trong kế hoạch của Alex chạy được: so trực quan lần đầu, số liệu tùy chọn qua `toHaveCSS` trong spec, và baseline regression. Tester quyết định mọi mục.
