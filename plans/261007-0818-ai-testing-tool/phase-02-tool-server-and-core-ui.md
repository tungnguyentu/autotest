---
phase: 2
title: "Phase 2: Server và UI lõi"
status: completed
priority: P1
effort: "3d"
dependencies: [1]
---

# Phase 2: Server và UI lõi

## Overview

Tool web local cho các bước không cần AI: danh sách tính năng, tạo tính năng, nạp use case, trang test case với duyệt, đăng nhập tay, quản lý đợt test, `summary.md`. UI tự cập nhật khi file trên disk đổi.

## Requirements

- [x] `npm start` mở server ở cổng 4173. Cổng bận thì in tiến trình đang giữ cổng và thoát, không đổi cổng.
- [x] UI tiếng Việt, dùng được ở độ rộng 1280 trở lên, không framework, không build.
- [x] Mọi thao tác ghi đi qua `feature-store.ts`, giữ đúng schema Phase 1.
- [x] Mỗi trang có ô "Bước tiếp theo" ghi rõ việc tester cần làm. Khi bước đó cần AI, ô này kèm lệnh Claude Code để copy.

## Files to Create

- Create: `tool/server.ts` (Express 5: static `tool/ui/`, JSON API, SSE `/events`)
- Create: `tool/api/features.ts` (GET/POST `/api/features`, GET/PUT `/api/features/:f`)
- Create: `tool/api/usecases.ts` (POST upload Markdown vào `features/<f>/usecases/`)
- Create: `tool/api/testcases.ts` (GET/PUT `/api/features/:f/testcases`, PATCH status từng id)
- Create: `tool/api/auth.ts` (POST `/api/features/:f/login/start` spawn `cli login`, POST `/login/save` ghi file cờ, GET trạng thái phiên từ `.meta.json`)
- Create: `tool/api/runs.ts` (GET danh sách đợt trong `EVIDENCE_ROOT`, POST tạo đợt mới, GET/PUT `summary.md`)
- Create: `tool/core/watcher.ts` (`chokidar` trên `features/`, `evidence/`, `tests/`, `auth/`, phát sự kiện `{path, type}` qua SSE)
- Create: `tool/core/summary.ts` (sinh `summary.md` từ `testcases.json`, `ai-run/*.json`, `ui-diff/*/metrics.json`, giữ mục "Kết luận của tester")
- Create: `tool/ui/index.html`, `tool/ui/feature.html`, `tool/ui/testcases.html`, `tool/ui/run.html`
- Create: `tool/ui/app.js` (fetch API, nhận SSE và tải lại phần đang xem), `tool/ui/style.css`
- Create: `tool/ui/next-step.js` (hiện ô "Bước tiếp theo" theo trạng thái dữ liệu)
- Create: `tool/api/__tests__/testcases.test.ts`, `summary.test.ts`

## Màn hình

1. **Trang chủ** `/`: bảng tính năng (tên, service, baseURL, số test case theo status, phiên đăng nhập còn hay chưa, đợt gần nhất). Nút "Tạo tính năng".
2. **Tính năng** `/feature.html?f=<f>`: form `feature.json` (service, baseURL, viewport, bảng screens với path, auth, mask, scale). Khu "Use case": danh sách file, nút tải lên. Khu "Đăng nhập": nút "Mở browser để đăng nhập", sau khi tester đăng nhập xong bấm "Lưu phiên", hiện ngày lưu. Khu "Đợt test": danh sách và nút "Tạo đợt mới".
3. **Test case** `/testcases.html?f=<f>`: bảng test case, mở rộng từng dòng để sửa `steps`, `expected`, `priority`, `type`. Nút trạng thái `draft → reviewed`. Khi chưa có `testcases.json` hiện ô "Bước tiếp theo" với lệnh `/gen-testcases <f>` để copy vào Claude Code.
4. **Đợt test** `/run.html?f=<f>&run=<dir>`: tổng quan đợt, `summary.md` xem và sửa mục "Kết luận của tester". Các khu AI run, Playwright, UI diff được bổ sung ở Phase 4 và 5.

## Implementation Steps

1. Viết `server.ts`: kiểm tra cổng bằng cách lắng nghe, bắt `EADDRINUSE`, chạy `lsof -i :4173` để in chủ cổng rồi thoát mã 1.
2. Viết `watcher.ts` và endpoint SSE. Debounce 300ms. Test bằng cách ghi file và nhận sự kiện.
3. Viết API features, usecases, testcases. PATCH status chỉ cho phép chuyển `draft → reviewed`, `reviewed → draft`. Các chuyển khác thuộc Phase 4.
4. Viết API auth: `login/start` spawn `npm run cli -- login --feature <f> --wait-flag`, `login/save` tạo file `auth/<f>.save`, tiến trình login thấy cờ thì lưu và thoát.
5. Viết API runs và `summary.ts`. Tên đợt lấy từ `paths.ts`. Không bao giờ ghi đè thư mục đã có.
6. Viết bốn trang HTML và `app.js`. Bố cục một cột, bảng rõ, màu ít. Mọi nút ghi phải có xác nhận kết quả.
7. Viết `next-step.js`: bảng trạng thái → thông điệp và lệnh. Ví dụ: chưa có use case → "Tải use case lên". Có use case, chưa có test case → lệnh `/gen-testcases <f>`. Có `reviewed`, chưa có `ai-run` → lệnh `/run-testcase <f> <id>`.
8. Viết test API bằng `node --test` với `supertest` hoặc `fetch` tới server trên cổng ngẫu nhiên.

## Todo

- [x] `server.ts` và xử lý cổng bận
- [x] `watcher.ts` cộng SSE
- [x] API features, usecases, testcases
- [x] API auth với file cờ
- [x] API runs và `summary.ts`
- [x] Bốn trang HTML, `app.js`, `style.css`
- [x] `next-step.js`
- [x] Test API

## Verification

- `npm start` rồi mở `http://localhost:4173` thấy tính năng `staging`.
- Tạo tính năng mới từ UI, kiểm tra `features/<f>/feature.json` đúng schema.
- Sửa `testcases.json` bằng tay trong editor, UI tự cập nhật trong 1 giây.
- Bấm "Mở browser để đăng nhập", đăng nhập, bấm "Lưu phiên", thấy `auth/<f>.json` và ngày lưu trên UI.
- Chạy `npm start` lần hai khi server đang chạy: in chủ cổng và thoát, không mở cổng khác.
- `npm test` xanh.

## Success Criteria

Tester đi hết bước 1 (tạo tính năng, nạp use case) và bước duyệt test case trên UI mà không mở editor. Phiên đăng nhập lưu được từ UI.
