---
phase: 1
title: "Phase 1: Nền tảng và schema"
status: in-progress
priority: P1
effort: "2d"
dependencies: []
---

# Phase 1: Nền tảng và schema

## Overview

Dựng khung project Node và cấu trúc thư mục. Viết schema cho mọi file mà tool và skill dùng chung, cùng `CLAUDE.md`. Chứng minh một file phiên dùng được ở ba nơi. Không có UI ở phase này.

## Requirements

- [x] Project chạy `npm install`, `npx playwright install chromium`, `npm run typecheck` không lỗi.
- [x] Schema `feature.json`, `testcases.json`, `ai-run/<id>.json`, `metrics.json`, `summary.md` được viết trong `docs/schemas.md` và có kiểm tra bằng code.
- [ ] `auth/<feature>.json` do lệnh `login` tạo nạp được ở agent-browser, script chụp Playwright, và `playwright.config.ts` với cookie thật.
- [x] Không dùng git (quyết định validation). Credential chỉ nằm trong `features/<feature>/.env` và `auth/`, cả hai được `tool/core/paths.ts` liệt kê là "không sao chép, không in".

## Files to Create

- Create: `package.json` (scripts: `start`, `cli`, `typecheck`, `test`), `tsconfig.json`, `.editorconfig`
- Create: `tool/cli.ts` (điểm vào dòng lệnh: `login`, `evidence-dir`, các lệnh sau thêm ở phase sau)
- Create: `tool/core/paths.ts` (resolve `features/`, `tests/`, `auth/`, `EVIDENCE_ROOT`, tên đợt `<YYYY-MM-DD>_<feature>[_rN]`)
- Create: `tool/core/schemas.ts` (kiểu TypeScript cộng hàm validate bằng `zod`)
- Create: `tool/core/feature-store.ts` (đọc, ghi, liệt kê `features/<feature>/`)
- Create: `tool/core/login.ts` (mở Chromium có giao diện, chờ tín hiệu, lưu storageState và `.meta.json`)
- Create: `playwright.config.ts` (theo mẫu trong kế hoạch của Alex, đọc `FEATURE`, `EVIDENCE_DIR`)
- Create: `CLAUDE.md` (bản trong kế hoạch của Alex, sửa cho agent-browser và cho tool Node)
- Create: `features/staging/feature.json` (baseURL site staging do tester cung cấp, `auth: true` cho mọi screen), `features/staging/usecases/README.md` (ghi chú chờ use case từ D5)
- Create: `docs/schemas.md`, `docs/README.md` (mục lục tài liệu)
- Create: `tool/core/__tests__/paths.test.ts`, `schemas.test.ts` (chạy bằng `node --test` qua `tsx`)

## Schema (tóm tắt, chi tiết trong docs/schemas.md)

`feature.json`: `feature`, `service`, `baseURL`, `viewport{width,height}`, `screens{<key>: {path, auth, mask[], scale, wait_for[]}}`.

`testcases.json`: mảng phần tử. Mỗi phần tử có `id`, `title`, `screen`, `preconditions[]`, `steps[]`, `expected[]`, `priority`, `type`, `status`. Giá trị `status`: `draft | reviewed | ai-passed | ai-failed | automated`. Tùy chọn: `manual`, `tester_note`.

`ai-run/<id>.json` độc lập công cụ:

```json
{
  "id": "TC_STAGING_001",
  "feature": "staging",
  "baseURL": "https://...",
  "viewport": { "width": 1440, "height": 900 },
  "started_at": "2026-10-07T15:00:00+07:00",
  "steps": [
    {
      "n": 1,
      "action": "navigate | click | fill | press | select | check | assert_text | assert_url",
      "target": { "role": "button", "name": "Đăng nhập", "label": null, "placeholder": null, "css": null },
      "value": "<secret:USER_EMAIL>",
      "url_before": "https://.../login",
      "url_after": "https://.../dashboard",
      "screenshot": "screenshots/TC_STAGING_001/01.png",
      "note": ""
    }
  ],
  "ai_result": { "verdict": "ĐẠT | KHÔNG ĐẠT | KHÔNG XÁC ĐỊNH", "per_expected": [ { "expected": "...", "verdict": "...", "observation": "..." } ] },
  "tester": { "decision": null, "note": "", "decided_at": null }
}
```

## Implementation Steps

Bước 1 đến 6 không cần site staging. Bước 7 cần baseURL, screen và tài khoản tester có OTP do tester cung cấp.

1. `npm init`, cài `typescript`, `tsx`, `zod`, `@playwright/test`, `playwright`. Thêm scripts.
2. Viết `paths.ts` và test: tên đợt tăng `_r2`, `_r3` khi thư mục đã tồn tại, không bao giờ trả về thư mục đã có.
3. Viết `schemas.ts` với zod cho năm schema, test parse mẫu hợp lệ và không hợp lệ.
4. Viết `login.ts`: nhận `--feature`, mở `baseURL` trong Chromium headed với viewport của tính năng. Chờ tín hiệu lưu từ stdin hoặc từ file cờ `auth/<feature>.save` (UI dùng file cờ ở Phase 2). Lưu `auth/<feature>.json` và `auth/<feature>.meta.json`.
5. Viết `playwright.config.ts` theo mẫu, thêm `projects` một Chromium, `snapshotPathTemplate` vào `tests/__screenshots__/<feature>/`.
6. Viết `CLAUDE.md` theo bản của Alex với ba sửa đổi: công cụ chạy thử là agent-browser, mọi script gọi qua `npm run cli -- <lệnh>`, credential chỉ qua `fill-secret`.
7. Spike tương thích phiên trên site staging. Tester chạy `login`, nhập username, password và OTP trong browser mở ra, rồi bấm lưu. Kiểm tra ba nơi:
   - `agent-browser --session spike --state auth/<feature>.json open <url đã đăng nhập>` rồi `get url` không bị chuyển về trang login.
   - Script Playwright nhỏ `new_context(storage_state=...)` mở cùng URL.
   - `FEATURE=<feature> npx playwright test` với một spec kiểm tra URL.
   Ghi kết quả vào `plans/261007-0818-ai-testing-tool/reports/session-compat.md`. Nếu agent-browser từ chối file, viết `tool/core/state-convert.ts` và ghi lý do.
8. Viết `docs/schemas.md` và `docs/README.md`.

## Todo

- [x] Khung project, scripts
- [x] `paths.ts` cộng test
- [x] `schemas.ts` cộng test
- [x] `login.ts`
- [x] `playwright.config.ts`
- [x] `CLAUDE.md`
- [ ] Spike phiên, báo cáo `reports/session-compat.md`
- [x] `docs/schemas.md`, `docs/README.md`

## Verification

- `npm run typecheck && npm test` xanh.
- `npm run cli -- login --feature staging` mở browser và ghi `auth/staging.json` sau khi bấm Enter.
- `reports/session-compat.md` ghi ba kết quả nạp phiên, mỗi kết quả kèm lệnh đã chạy.
- `grep -r` giá trị password giả trong `evidence/`, `tests/`, `docs/` không có kết quả.

## Success Criteria

Một người mới clone repo, chạy ba lệnh cài đặt, chạy `login` và thấy file phiên dùng được ở ba nơi. Schema có test và tài liệu.
