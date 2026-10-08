---
phase: 4
title: "Phase 4: Duyệt kết quả AI và Playwright"
status: completed
priority: P1
effort: "2d"
dependencies: [2, 3]
---

# Phase 4: Duyệt kết quả AI và Playwright

## Overview

Đưa kết quả của Phase 3 lên UI: xem từng step kèm ảnh, xác nhận hoặc từ chối kết quả AI, chạy spec và regression từ UI, xem report và trace của Playwright.

## Requirements

- [x] Trang đợt test hiện mọi `ai-run/<id>.json` với bảng step, ảnh từng step, verdict đề xuất, nội dung `ai-run/<id>.md`.
- [x] Tester bấm "Xác nhận" hoặc "Từ chối" kèm ghi chú. Tool ghi `tester.decision` vào `ai-run/<id>.json` và đổi status test case sang `ai-passed` hoặc `ai-failed`. Từ chối có ô "Nghi bug" ghi vào `bugs.md`.
- [x] Nút "Chạy spec" cho từng test case có `tests/<f>/<id>.spec.ts`, nút "Regression" chạy cả thư mục. Kết quả, report HTML, trace hiện trên UI.
- [x] Tester đổi status `ai-passed → automated` chỉ sau khi spec chạy pass ít nhất một lần và tester bấm "Đưa vào regression".

## Files to Create / Modify

- Create: `tool/api/ai-runs.ts` (GET `/api/runs/:run/ai-runs`, POST `/api/runs/:run/ai-runs/:id/decision`)
- Create: `tool/api/playwright.ts` (POST `/api/features/:f/playwright/run` với `spec` tùy chọn, GET trạng thái tiến trình, static cho `playwright-report/`)
- Create: `tool/core/playwright-runner.ts` (spawn `npx playwright test` với `FEATURE`, `EVIDENCE_DIR`, stream stdout qua SSE, một tiến trình mỗi lúc, dừng được)
- Create: `tool/core/bugs.ts` (thêm mục vào `bugs.md` của đợt)
- Modify: `tool/ui/run.html`, `tool/ui/app.js` (khu "AI run", khu "Playwright")
- Create: `tool/ui/ai-run-viewer.js` (bảng step, ảnh phóng to, bảng `per_expected`, nút quyết định)
- Modify: `tool/api/testcases.ts` (cho phép chuyển `ai-passed → automated` qua endpoint riêng, kiểm tra spec tồn tại và lần chạy gần nhất pass)
- Modify: `tool/core/summary.ts` (bảng test case lấy quyết định của tester và kết quả Playwright)
- Create: `tool/api/__tests__/ai-runs.test.ts`, `tool/core/__tests__/playwright-runner.test.ts`

## Implementation Steps

1. Viết `ai-runs.ts`: liệt kê theo đợt, trả về JSON cộng nội dung `.md`. Endpoint quyết định ghi `tester.decision`, `note`, `decided_at`, rồi cập nhật `testcases.json`.
2. Viết `ai-run-viewer.js`: bảng step với cột số, action, target, value, URL sau, ảnh thu nhỏ. Bấm ảnh mở lớn. Dưới bảng là `per_expected` và nút quyết định.
3. Viết `playwright-runner.ts`: spawn, ghi log vào `<đợt>/playwright-log.txt`, phát từng dòng qua SSE, lưu mã thoát và thời điểm vào `<đợt>/playwright-last.json`. Từ chối chạy khi đã có tiến trình.
4. Viết `playwright.ts`: serve `<đợt>/playwright-report/` ở `/report/<run>/`, iframe trên UI. Trace mở qua `npx playwright show-trace` do tester chạy, UI hiện lệnh để copy.
5. Khu "Playwright" trên `run.html`: nút chạy từng spec, nút regression, log trực tiếp, kết quả gần nhất, iframe report.
6. Endpoint `automated`: kiểm tra `tests/<f>/<id>.spec.ts` tồn tại, `playwright-last.json` có spec đó pass, rồi đổi status.
7. Cập nhật `summary.ts` và `next-step.js` cho các trạng thái mới.
8. Test: quyết định ghi đúng hai file, runner từ chối chạy song song, endpoint `automated` từ chối khi chưa pass.

## Todo

- [x] API ai-runs cộng quyết định
- [x] `ai-run-viewer.js`
- [x] `playwright-runner.ts` cộng SSE log
- [x] API Playwright cộng serve report
- [x] Khu Playwright trên `run.html`
- [x] Endpoint `automated`
- [x] `summary.ts`, `next-step.js`, `bugs.ts`
- [x] Test

## Verification

- Sau `/run-testcase staging <id>`, mở trang đợt: thấy bảng step và ảnh trong 1 giây mà không tải lại trang.
- Bấm "Xác nhận": `ai-run/<id>.json` có `tester.decision = "confirmed"`, test case thành `ai-passed`.
- Bấm "Chạy spec" sau `/to-playwright`: log hiện trực tiếp, report mở trong iframe, `playwright-last.json` ghi kết quả.
- Bấm "Đưa vào regression" khi spec pass: status thành `automated`. Khi spec chưa pass: UI báo lỗi, status không đổi.
- Bấm "Regression": chạy mọi spec trong `tests/staging/`, report và trace vào thư mục đợt.

## Success Criteria

Tester duyệt kết quả AI, chạy spec và regression, xem report, hoàn toàn trên UI. Status test case chỉ đổi theo quyết định của tester.
